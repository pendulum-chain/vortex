import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EphemeralAccountType, EvmToken, Networks, PRESIGNED_EVM_FEE_MULTIPLIER, QuoteError } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { decodeFunctionData, erc20Abi, getAddress } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../../config/logger";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import Subsidy from "../../../../../models/subsidy.model";
import { installFakeFinancialJournal } from "../../../../../test-utils/fake-financial-journal";
import { APIError } from "../../../../errors/api-error";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError } from "../../../../errors/phase-error";
import { getEvmFundingAccount } from "../core/evm-funding";
import { aggregateNativePrefunding, allocateNonces } from "../core/prepare";
import { ROBINHOOD_STOCKS, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, ROBINHOOD_USDG_ADDRESS } from "../core/robinhood-stocks";
import type { PhaseCtx, PrepareCtx } from "../core/types";
import { stockSettlementRouterAbi } from "../phases/stock-settlement/contract";
import {
  simulateStockSettlement,
  StockSettlementContext,
  type StockSettlementMetadata
} from "../phases/stock-settlement/simulation";
import { prepareStockSettlementTxs } from "../phases/stock-settlement/transactions";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../phases/uniswap-v3-fixed-swap/contract";

const journal = installFakeFinancialJournal();
const { StockSettlementExecutor } = await import("../phases/stock-settlement/execution");
type Dependencies = NonNullable<ConstructorParameters<typeof StockSettlementExecutor>[0]>;

afterAll(() => journal.restore());

const ephemeral = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd").address;
const funding = getEvmFundingAccount(Networks.Robinhood).address;
const NVDA = EvmToken.NVDA;
const STOCK = ROBINHOOD_STOCKS.NVDA.address;
const TARGET = 1_000_000_000_000_000_000n;
const SHORTFALL = 10_000_000_000_000_000n;
const PRICE_USD = new Big("180");
const USDG_IN = 1_810_000n;
const MAX_FEE_PER_GAS = 30_000_000n;

const metadata: StockSettlementMetadata = {
  amountRaw: TARGET.toString(),
  maxSubsidyUsd: "10.00",
  network: Networks.Robinhood,
  token: NVDA
};

let subsidyRows: Array<Record<string, unknown>>;

beforeEach(() => {
  journal.reset();
  subsidyRows = [];
  spyOn(QuoteTicket, "findByPk").mockResolvedValue({ metadata: { blocks: { [StockSettlementContext.key]: metadata } } } as never);
  spyOn(Subsidy, "findOne").mockImplementation((async () => subsidyRows[0] ?? null) as never);
  spyOn(Subsidy, "create").mockImplementation((async (row: Record<string, unknown>) => {
    subsidyRows.push(row);
    return { id: "subsidy-1", ...row };
  }) as never);
});

afterEach(() => mock.restore());

function rampState() {
  const state = {
    currentPhase: "stockSettlementTopUp",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    quoteId: "quote-1",
    state: { evmEphemeralAddress: ephemeral, flow: { id: "test-flow", version: 1 } },
    async update(patch: Record<string, unknown>) {
      Object.assign(state, patch);
      return state;
    }
  };
  return state as never;
}

interface FakeChain {
  balances: Map<string, bigint>;
  fundingEth: bigint;
  receiptStatus: "success" | "reverted";
  sends: Array<{ data: `0x${string}`; gas: bigint; to: `0x${string}` }>;
}

const key = (token: string, owner: string) => `${token}:${owner}`.toLowerCase();

function fakeChain({
  ephemeralStock = TARGET - SHORTFALL,
  fundingEth = 10n ** 18n,
  fundingStock = 0n,
  fundingUsdg = 1_000_000_000n,
  overrides = {}
}: {
  ephemeralStock?: bigint;
  fundingEth?: bigint;
  fundingStock?: bigint;
  fundingUsdg?: bigint;
  overrides?: Partial<Dependencies>;
} = {}) {
  const chain: FakeChain = {
    balances: new Map([
      [key(STOCK, ephemeral), ephemeralStock],
      [key(STOCK, funding), fundingStock],
      [key(ROBINHOOD_USDG_ADDRESS, funding), fundingUsdg]
    ]),
    fundingEth,
    receiptStatus: "success",
    sends: []
  };
  const dependencies: Dependencies = {
    estimateMaxFeePerGas: async () => MAX_FEE_PER_GAS,
    getNativeBalance: async owner => (owner === funding ? chain.fundingEth : 0n),
    getTokenBalance: async (token, owner) => chain.balances.get(key(token, owner)) ?? 0n,
    quoteUsdgIn: async () => USDG_IN,
    readStockPriceUsd: async () => PRICE_USD,
    send: async transaction => {
      chain.sends.push(transaction);
      if (chain.receiptStatus === "success" && transaction.to !== ROBINHOOD_USDG_ADDRESS) {
        chain.balances.set(key(STOCK, ephemeral), TARGET);
      }
      return `0x${chain.sends.length.toString(16).padStart(64, "0")}`;
    },
    waitForReceipt: async () => ({ status: chain.receiptStatus }),
    ...overrides
  };
  return { chain, executor: new StockSettlementExecutor(dependencies) };
}

describe("StockSettlementExecutor", () => {
  it("does nothing when the swap delivered enough, leaving a surplus for the sweep", async () => {
    const { chain, executor } = fakeChain({ ephemeralStock: TARGET + 5n });

    await executor.execute(rampState());

    expect(chain.sends).toEqual([]);
    expect(chain.balances.get(key(STOCK, ephemeral))).toBe(TARGET + 5n);
    expect(subsidyRows).toEqual([]);
  });

  it("transfers the shortfall from the funding wallet's own stock and records the subsidy", async () => {
    const { chain, executor } = fakeChain({ fundingStock: SHORTFALL });
    const state = rampState();

    await executor.execute(state);

    expect(chain.sends).toHaveLength(1);
    expect(chain.sends[0].to).toBe(STOCK);
    expect(decodeFunctionData({ abi: erc20Abi, data: chain.sends[0].data })).toMatchObject({
      args: [ephemeral, SHORTFALL],
      functionName: "transfer"
    });
    expect(subsidyRows).toEqual([
      expect.objectContaining({
        amount: 0.01,
        payerAccount: funding,
        phase: "stockSettlementTopUp",
        rampId: "ramp-1",
        token: NVDA,
        transactionHash: `0x${"1".padStart(64, "0")}`
      })
    ]);
    expect((state as { state: { blockState: Record<string, unknown> } }).state.blockState[StockSettlementContext.key]).toEqual({
      topUpAmountRaw: SHORTFALL.toString(),
      topUpTxHash: `0x${"1".padStart(64, "0")}`
    });
  });

  it("buys the shortfall with USDG otherwise: exact approve of quote plus 1%, then exact output to the ephemeral", async () => {
    const { chain, executor } = fakeChain({ fundingStock: SHORTFALL - 1n });

    await executor.execute(rampState());

    const amountInMaximum = (USDG_IN * 101n) / 100n;
    expect(chain.sends.map(send => [send.to, send.gas])).toEqual([
      [ROBINHOOD_USDG_ADDRESS, UNISWAP_APPROVE_GAS_LIMIT],
      [ROBINHOOD_UNISWAP_SWAP_ROUTER_02, UNISWAP_SWAP_GAS_LIMIT]
    ]);
    expect(decodeFunctionData({ abi: erc20Abi, data: chain.sends[0].data })).toMatchObject({
      args: [getAddress(ROBINHOOD_UNISWAP_SWAP_ROUTER_02), amountInMaximum],
      functionName: "approve"
    });
    expect(decodeFunctionData({ abi: stockSettlementRouterAbi, data: chain.sends[1].data }).args[0]).toEqual({
      amountInMaximum,
      amountOut: SHORTFALL,
      fee: ROBINHOOD_STOCKS.NVDA.uniswapFee,
      recipient: ephemeral,
      sqrtPriceLimitX96: 0n,
      tokenIn: ROBINHOOD_USDG_ADDRESS,
      tokenOut: STOCK
    });
    expect(subsidyRows).toEqual([expect.objectContaining({ amount: 0.01, token: NVDA })]);
  });

  it.each([
    [9_999_999n, 10_000_000n],
    [10_000_000n, 10_000_000n],
    [9_999_999n, 1_000_000_000n],
    [10_000_000n, 1_000_000_000n]
  ])(
    "bounds both USDG authorizations by the persisted cap with quote %s and balance %s",
    async (quoted, fundingUsdg) => {
      const capRaw = 10_000_000n;
      const { chain, executor } = fakeChain({
        fundingUsdg,
        overrides: { quoteUsdgIn: async () => quoted }
      });

      await executor.execute(rampState());

      expect(chain.sends).toHaveLength(2);
      expect(decodeFunctionData({ abi: erc20Abi, data: chain.sends[0].data })).toMatchObject({
        args: [getAddress(ROBINHOOD_UNISWAP_SWAP_ROUTER_02), capRaw],
        functionName: "approve"
      });
      expect(decodeFunctionData({ abi: stockSettlementRouterAbi, data: chain.sends[1].data })).toMatchObject({
        args: [expect.objectContaining({ amountInMaximum: capRaw, amountOut: SHORTFALL })],
        functionName: "exactOutputSingle"
      });
    }
  );

  it.each<[string, bigint, Partial<Dependencies>]>([
    ["the transfer path, at the Chainlink price", SHORTFALL, { readStockPriceUsd: async () => new Big("1001") }],
    ["the USDG path, at the Uniswap quote", 0n, { quoteUsdgIn: async () => 10_000_001n }]
  ])("pauses above the cap on %s, and never fails the ramp", async (_label, fundingStock, overrides) => {
    const warn = spyOn(logger, "warn");
    const { chain, executor } = fakeChain({ fundingStock, overrides });

    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);

    expect(chain.sends).toEqual([]);
    expect(journal.rows.get("stock-settlement-top-up")).toBeUndefined();
    expect(warn).toHaveBeenCalledWith("STOCK_SETTLEMENT_SUBSIDY_CAP_EXCEEDED", expect.objectContaining({ token: NVDA }));
  });

  it("moves on once an operator has resolved a paused ramp by topping the ephemeral up", async () => {
    const { chain, executor } = fakeChain({ overrides: { quoteUsdgIn: async () => 10_000_001n } });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);

    chain.balances.set(key(STOCK, ephemeral), TARGET);
    await executor.execute(state);

    expect(chain.sends).toEqual([]);
    expect(subsidyRows).toEqual([]);
  });

  it("logs and retries when the funding wallet holds neither the stock nor the USDG", async () => {
    const error = spyOn(logger, "error");
    const { chain, executor } = fakeChain({ fundingUsdg: (USDG_IN * 101n) / 100n - 1n });

    const thrown = await executor.execute(rampState()).catch(value => value);

    expect(thrown).toBeInstanceOf(RecoverablePhaseError);
    expect(thrown).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.sends).toEqual([]);
    expect(error).toHaveBeenCalledWith("EVM_FUNDING_TOKEN_BALANCE_LOW", expect.objectContaining({ token: ROBINHOOD_USDG_ADDRESS }));
  });

  it.each<[string, bigint, bigint]>([
    ["the transfer path", SHORTFALL, 100_000n],
    ["the USDG path", 0n, UNISWAP_APPROVE_GAS_LIMIT + UNISWAP_SWAP_GAS_LIMIT]
  ])("holds unclaimed while the funding wallet cannot pay the gas on %s, and delivers once it is refilled", async (_label, fundingStock, gas) => {
    const error = spyOn(logger, "error");
    const required = gas * MAX_FEE_PER_GAS;
    const { chain, executor } = fakeChain({ fundingEth: required - 1n, fundingStock });
    const state = rampState();

    const thrown = await executor.execute(state).catch(value => value);

    expect(thrown).toBeInstanceOf(RecoverablePhaseError);
    expect(thrown).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.sends).toEqual([]);
    expect(journal.rows.get("stock-settlement-top-up")).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "EVM_FUNDING_TOKEN_BALANCE_LOW",
      expect.objectContaining({ requiredRaw: required.toString(), token: "ETH" })
    );

    chain.fundingEth = required;
    await executor.execute(state);

    expect(chain.balances.get(key(STOCK, ephemeral))).toBe(TARGET);
    expect(journal.rows.get("stock-settlement-top-up")?.status).toBe("confirmed");
  });

  it("retries while the price reference is unavailable", async () => {
    const { executor } = fakeChain({
      fundingStock: SHORTFALL,
      overrides: {
        readStockPriceUsd: async () => {
          throw new APIError({ message: QuoteError.StockPriceUnavailable, status: httpStatus.SERVICE_UNAVAILABLE });
        }
      }
    });

    const thrown = await executor.execute(rampState()).catch(value => value);

    expect(thrown).toBeInstanceOf(RecoverablePhaseError);
    expect(thrown).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
  });

  it("records the subsidy and sends nothing when re-entered after a crash past the journal", async () => {
    const { chain, executor } = fakeChain({ fundingStock: SHORTFALL });
    const state = rampState();
    await executor.execute(state);
    subsidyRows.length = 0;

    await executor.execute(state);

    expect(chain.sends).toHaveLength(1);
    expect(subsidyRows).toEqual([expect.objectContaining({ phase: "stockSettlementTopUp" })]);
  });

  it("reconciles a top-up that landed before a crash by the ephemeral balance, and does not resend", async () => {
    let attempt = 0;
    const { chain, executor } = fakeChain({
      fundingStock: SHORTFALL,
      overrides: {
        waitForReceipt: async () => {
          attempt += 1;
          if (attempt === 1) throw new Error("rpc lost");
          return { status: "success" };
        }
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    await executor.execute(state);

    expect(chain.sends).toHaveLength(1);
    expect(subsidyRows).toEqual([expect.objectContaining({ transactionHash: `0x${"1".padStart(64, "0")}` })]);
  });

  it("pauses instead of resending when a claimed top-up cannot be proven", async () => {
    let sent = 0;
    const { executor } = fakeChain({
      fundingStock: SHORTFALL,
      overrides: {
        send: async () => {
          sent += 1;
          throw new Error("rpc lost");
        }
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);

    expect(sent).toBe(1);
  });

  it("pauses on a mined revert, then retries it from a fresh plan on the next pass", async () => {
    const { chain, executor } = fakeChain({ fundingStock: SHORTFALL });
    chain.receiptStatus = "reverted";
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(subsidyRows).toEqual([]);

    chain.receiptStatus = "success";
    await executor.execute(state);

    expect(chain.sends).toHaveLength(2);
    expect(chain.balances.get(key(STOCK, ephemeral))).toBe(TARGET);
  });

  it("never fails the ramp on an unexpected error", async () => {
    const { executor } = fakeChain({
      overrides: {
        getTokenBalance: async () => {
          throw new TypeError("rpc returned nonsense");
        }
      }
    });

    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(RecoverablePhaseError);
  });
});

describe("StockSettlement simulation", () => {
  const ctx = { addNote() {} } as unknown as PhaseCtx;
  const simulate = (usd: string) =>
    simulateStockSettlement(
      NVDA,
      {
        amount: new Big(1),
        amountRaw: TARGET.toString(),
        chain: Networks.Robinhood,
        requestInputAmountUsd: new Big(usd),
        token: NVDA
      },
      ctx
    );

  it.each([
    // 2.5% of the input, floored at $10 and capped at $50.
    ["100", "10.00"],
    ["400", "10.00"],
    ["1000", "25.00"],
    ["2000", "50.00"],
    ["100000", "50.00"]
  ])("caps a top-up on a $%s swap at $%s", async (usd, cap) => {
    expect(config.stocks.settlementSubsidyMaxBps).toBe(250);
    const { metadata: simulated, output } = await simulate(usd);

    expect(simulated).toEqual({ amountRaw: TARGET.toString(), maxSubsidyUsd: cap, network: Networks.Robinhood, token: NVDA });
    expect(output.amountRaw).toBe(TARGET.toString());
  });

  it("refuses an input with no USD value", async () => {
    await expect(
      simulateStockSettlement(NVDA, { amount: new Big(1), amountRaw: "1", chain: Networks.Robinhood, token: NVDA }, ctx)
    ).rejects.toThrow("with its USD value");
  });
});

describe("StockSettlement transactions", () => {
  it("issues the cleanup approval on the cleanup lane with its gas prefunded", async () => {
    const txData = {
      data: "0x" as const,
      gas: "100000",
      maxFeePerGas: "30000000",
      maxPriorityFeePerGas: "0",
      to: STOCK,
      value: "0"
    };
    const prepareApproval = mock(async () => txData);

    const { intents, state } = await prepareStockSettlementTxs(
      {
        accounts: { EVM: { address: ephemeral, type: EphemeralAccountType.EVM } },
        globals: {} as never,
        ownMetadata: metadata,
        ownRegistrationFacts: undefined,
        quote: {} as never
      } as PrepareCtx<StockSettlementMetadata>,
      prepareApproval
    );

    expect(state).toBeUndefined();
    expect(prepareApproval).toHaveBeenCalledWith(STOCK, funding, Networks.Robinhood);
    expect(intents).toEqual([
      {
        lane: "cleanup",
        network: Networks.Robinhood,
        phase: "robinhoodCleanupStock",
        prefundNativeValueRaw: (100_000n * 30_000_000n * PRESIGNED_EVM_FEE_MULTIPLIER).toString(),
        signer: ephemeral,
        txData
      }
    ]);
    expect(allocateNonces(intents)[0].phase).toBe("robinhoodCleanupStock");
    expect(aggregateNativePrefunding(intents)).toEqual({
      [`${Networks.Robinhood}:${ephemeral.toLowerCase()}`]: "9000000000000"
    });
  });
});
