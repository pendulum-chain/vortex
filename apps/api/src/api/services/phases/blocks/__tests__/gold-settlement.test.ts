import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EphemeralAccountType, type EvmTransactionData, Networks, PRESIGNED_EVM_FEE_MULTIPLIER } from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, getAddress, parseAbi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import Subsidy from "../../../../../models/subsidy.model";
import { installFakeFinancialJournal } from "../../../../../test-utils/fake-financial-journal";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError } from "../../../../errors/phase-error";
import { getEvmFundingAccount } from "../core/evm-funding";
import { BASE_PANCAKE_V3_ROUTER, BASE_PAXG_ADDRESS, BASE_USDC_ADDRESS, GOLD_TOKEN } from "../core/gold-base";
import type { PhaseCtx, PrepareCtx } from "../core/types";
import {
  GoldSettlementContext,
  type GoldSettlementMetadata,
  goldSettlementSubsidyCapUsd,
  simulateGoldSettlement
} from "../phases/gold-settlement/simulation";
import { prepareGoldSettlementTxs } from "../phases/gold-settlement/transactions";
import { UNISWAP_APPROVE_GAS_LIMIT, UNISWAP_SWAP_GAS_LIMIT } from "../phases/uniswap-v3-fixed-swap/contract";

const journal = installFakeFinancialJournal();
const { GoldSettlementExecutor } = await import("../phases/gold-settlement/execution");
type Dependencies = NonNullable<ConstructorParameters<typeof GoldSettlementExecutor>[0]>;

afterAll(() => journal.restore());

const routerAbi = parseAbi([
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)"
]);
const ephemeral = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd").address;
const funding = getEvmFundingAccount(Networks.Base).address;
/** 0.025 PAXG promised; the swap left it 0.0001 PAXG short, which costs 0.40 USDC to buy. */
const TARGET = 25_000_000_000_000_000n;
const SHORTFALL = 100_000_000_000_000n;
const USDC_IN = 400_000n;
const NOW_MS = Date.UTC(2026, 10, 18, 12);
/** Stands in for the buy's presigned swap; only its presence matters here, the fill is injected. */
const SWAP_TX = "0x02c0";
const metadata: GoldSettlementMetadata = { amountRaw: TARGET.toString(), maxSubsidyUsd: "1.000000" };

let subsidyRows: Array<Record<string, unknown>>;

beforeEach(() => {
  journal.reset();
  subsidyRows = [];
  spyOn(QuoteTicket, "findByPk").mockResolvedValue({ metadata: { blocks: { [GoldSettlementContext.key]: metadata } } } as never);
  spyOn(Subsidy, "findOne").mockImplementation((async () => subsidyRows[0] ?? null) as never);
  spyOn(Subsidy, "create").mockImplementation((async (row: Record<string, unknown>) => {
    subsidyRows.push(row);
    return { id: "subsidy-1", ...row };
  }) as never);
});

afterEach(() => mock.restore());

function rampState(blockState: Record<string, unknown> = {}) {
  const state = {
    currentPhase: "goldSettlementTopUp",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs: [{ phase: "uniswapSwap", txData: SWAP_TX }],
    quoteId: "quote-1",
    state: { blockState, evmEphemeralAddress: ephemeral, flow: { id: "test-flow", version: 1 } },
    async update(patch: Record<string, unknown>) {
      Object.assign(state, patch);
      return state;
    }
  };
  return state as never;
}

const key = (token: string, owner: string) => `${token}:${owner}`.toLowerCase();

function fakeChain({
  ephemeralPaxg = TARGET - SHORTFALL,
  fundingEth = 10n ** 18n,
  fundingUsdc = 1_000_000_000n,
  overrides = {},
  swapFill = TARGET - SHORTFALL
}: {
  ephemeralPaxg?: bigint;
  fundingEth?: bigint;
  fundingUsdc?: bigint;
  overrides?: Partial<Dependencies>;
  swapFill?: bigint | null;
} = {}) {
  const chain = {
    balances: new Map([
      [key(BASE_PAXG_ADDRESS, ephemeral), ephemeralPaxg],
      [key(BASE_USDC_ADDRESS, funding), fundingUsdc]
    ]),
    receiptStatus: "success" as "success" | "reverted",
    sends: [] as Array<{ data: `0x${string}`; gas: bigint; to: `0x${string}` }>
  };
  const dependencies: Dependencies = {
    estimateMaxFeePerGas: async () => 20_000_000n,
    getNativeBalance: async owner => (owner === funding ? fundingEth : 0n),
    getSwapFill: async () => swapFill,
    getTokenBalance: async (token, owner) => chain.balances.get(key(token, owner)) ?? 0n,
    now: () => NOW_MS,
    quoteUsdcIn: async () => USDC_IN,
    send: async transaction => {
      chain.sends.push(transaction);
      if (chain.receiptStatus === "success" && transaction.to !== BASE_USDC_ADDRESS) {
        chain.balances.set(key(BASE_PAXG_ADDRESS, ephemeral), TARGET);
      }
      return `0x${chain.sends.length.toString(16).padStart(64, "0")}`;
    },
    waitForReceipt: async () => ({ status: chain.receiptStatus }),
    ...overrides
  };
  return { chain, executor: new GoldSettlementExecutor(dependencies) };
}

describe("Gold settlement simulation", () => {
  const { settlementSubsidyMaxBps, settlementSubsidyMaxUsd, settlementSubsidyMinUsd } = config.gold;
  afterEach(() => {
    config.gold.settlementSubsidyMaxBps = settlementSubsidyMaxBps;
    config.gold.settlementSubsidyMaxUsd = settlementSubsidyMaxUsd;
    config.gold.settlementSubsidyMinUsd = settlementSubsidyMinUsd;
  });
  const paxg = (usd?: string) => ({
    amount: new Big("0.025"),
    amountRaw: TARGET.toString(),
    chain: Networks.Base,
    requestInputAmountUsd: usd === undefined ? undefined : new Big(usd),
    token: GOLD_TOKEN
  });
  const ctx = { addNote: () => {} } as unknown as PhaseCtx;

  it("caps the top-up at 0.25% of the trade, between 5 and 50 USD, by default", () => {
    expect(goldSettlementSubsidyCapUsd(new Big("8.45")).toString()).toBe("5");
    expect(goldSettlementSubsidyCapUsd(new Big("2000")).toString()).toBe("5");
    expect(goldSettlementSubsidyCapUsd(new Big("5000")).toString()).toBe("12.5");
    expect(goldSettlementSubsidyCapUsd(new Big("20000")).toString()).toBe("50");
    expect(goldSettlementSubsidyCapUsd(new Big("1000000")).toString()).toBe("50");
    config.gold.settlementSubsidyMinUsd = "0.5";
    config.gold.settlementSubsidyMaxBps = 50;
    config.gold.settlementSubsidyMaxUsd = "20";
    expect(goldSettlementSubsidyCapUsd(new Big("5000")).toString()).toBe("20");
    expect(goldSettlementSubsidyCapUsd(new Big("200")).toString()).toBe("1");
    expect(goldSettlementSubsidyCapUsd(new Big("10")).toString()).toBe("0.5");
  });

  it("passes the promised amount through and records the cap, rounded down", async () => {
    const input = paxg("3333.33333333");
    const { metadata: simulated, output } = await simulateGoldSettlement(input as never, ctx);
    expect(output).toBe(input as never);
    expect(simulated).toEqual({ amountRaw: TARGET.toString(), maxSubsidyUsd: "8.333333" });
  });

  it.each([
    ["without the swap input's USD value", paxg()],
    ["for another token", { ...paxg("100"), token: "USDC" }],
    ["on another chain", { ...paxg("100"), chain: Networks.Ethereum }]
  ])("refuses to run %s", async (_label, input) => {
    await expect(simulateGoldSettlement(input as never, ctx)).rejects.toThrow("GoldSettlement requires");
  });
});

describe("Gold settlement transactions", () => {
  it("presigns one cleanup approval that lets the funding account sweep a surplus", async () => {
    const txData: EvmTransactionData = {
      data: "0x",
      gas: "100000",
      maxFeePerGas: "20000000",
      maxPriorityFeePerGas: "1",
      to: BASE_PAXG_ADDRESS,
      value: "0"
    };
    const calls: unknown[][] = [];
    const { intents } = await prepareGoldSettlementTxs(
      {
        accounts: { [EphemeralAccountType.EVM]: { address: ephemeral, type: EphemeralAccountType.EVM } },
        ownMetadata: metadata
      } as unknown as PrepareCtx<GoldSettlementMetadata>,
      (async (...args: unknown[]) => {
        calls.push(args);
        return txData;
      }) as never
    );
    expect(calls).toEqual([[BASE_PAXG_ADDRESS, funding, Networks.Base]]);
    expect(intents).toEqual([
      {
        lane: "cleanup",
        network: Networks.Base,
        phase: "baseCleanupPaxg",
        prefundNativeValueRaw: (100_000n * 20_000_000n * PRESIGNED_EVM_FEE_MULTIPLIER).toString(),
        signer: ephemeral,
        txData
      }
    ]);
  });
});

describe("GoldSettlementExecutor", () => {
  it("does nothing when the swap delivered enough, leaving a surplus for the sweep", async () => {
    const { chain, executor } = fakeChain({ ephemeralPaxg: TARGET + 5n });
    await executor.execute(rampState());
    expect(chain.sends).toEqual([]);
    expect(subsidyRows).toEqual([]);
  });

  it("buys the shortfall with the funding wallet's USDC: exact approve of quote plus 1%, then exact output to the ephemeral", async () => {
    const { chain, executor } = fakeChain();
    const state = rampState();

    await executor.execute(state);

    const amountInMaximum = (USDC_IN * 101n) / 100n;
    expect(chain.sends.map(send => [send.to, send.gas])).toEqual([
      [BASE_USDC_ADDRESS, UNISWAP_APPROVE_GAS_LIMIT],
      [BASE_PANCAKE_V3_ROUTER, UNISWAP_SWAP_GAS_LIMIT]
    ]);
    expect(decodeFunctionData({ abi: erc20Abi, data: chain.sends[0].data })).toMatchObject({
      args: [getAddress(BASE_PANCAKE_V3_ROUTER), amountInMaximum],
      functionName: "approve"
    });
    expect(decodeFunctionData({ abi: routerAbi, data: chain.sends[1].data }).args[0]).toEqual({
      amountInMaximum,
      amountOut: SHORTFALL,
      deadline: BigInt(NOW_MS / 1000 + 600),
      fee: 500,
      recipient: ephemeral,
      sqrtPriceLimitX96: 0n,
      tokenIn: BASE_USDC_ADDRESS,
      tokenOut: BASE_PAXG_ADDRESS
    });
    expect(subsidyRows).toEqual([
      expect.objectContaining({
        amount: 0.0001,
        payerAccount: funding,
        phase: "goldSettlementTopUp",
        rampId: "ramp-1",
        token: GOLD_TOKEN,
        transactionHash: `0x${"2".padStart(64, "0")}`
      })
    ]);
    expect((state as { state: { blockState: Record<string, unknown> } }).state.blockState[GoldSettlementContext.key]).toEqual({
      topUpAmountRaw: SHORTFALL.toString(),
      topUpTxHash: `0x${"2".padStart(64, "0")}`
    });
  });

  it("never authorizes more USDC than the persisted cap", async () => {
    // Quoted just under the 1 USD cap: plus 1% it would exceed it.
    const { chain, executor } = fakeChain({ overrides: { quoteUsdcIn: async () => 995_000n } });
    await executor.execute(rampState());
    expect(decodeFunctionData({ abi: erc20Abi, data: chain.sends[0].data }).args?.[1]).toBe(1_000_000n);
    expect(decodeFunctionData({ abi: routerAbi, data: chain.sends[1].data }).args[0].amountInMaximum).toBe(1_000_000n);
  });

  it("pauses for an operator, sending nothing, when the shortfall costs more than the cap", async () => {
    const { chain, executor } = fakeChain({ overrides: { quoteUsdcIn: async () => 1_000_001n } });
    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.sends).toEqual([]);
    expect(subsidyRows).toEqual([]);
  });

  it.each([
    ["the ephemeral holds less than the swap delivered", { swapFill: TARGET - SHORTFALL + 1n }],
    ["the swap delivered the full amount and the balance is short anyway", { swapFill: TARGET }],
    ["the swap has no successful receipt", { swapFill: null }]
  ])("pauses for an operator, sending nothing, when %s", async (_label, options) => {
    // The buyer holds the ephemeral's key: the funding wallet replaces only what the swap itself fell short by.
    const { chain, executor } = fakeChain(options);
    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(chain.sends).toEqual([]);
    expect(subsidyRows).toEqual([]);
  });

  it("pauses, sending nothing, when the swap was not broadcast by the API, however small the shortfall", async () => {
    // Whoever holds the presigned swap can send it at a price of their choosing. That fill is not made whole.
    const { chain, executor } = fakeChain();
    const state = rampState({ goldSwap: { sentOutsideApi: true, swapDeadline: "1800000000" } });
    const error = await executor.execute(state).catch(caught => caught);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect((error as Error).message).toContain("not broadcast by the API");
    expect(chain.sends).toEqual([]);
    expect(subsidyRows).toEqual([]);
  });

  it("buys the shortfall again after a top-up that reverted, and records one subsidy", async () => {
    const { chain, executor } = fakeChain();
    const state = rampState();
    chain.receiptStatus = "reverted";
    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    chain.receiptStatus = "success";
    await executor.execute(state);
    expect(chain.balances.get(key(BASE_PAXG_ADDRESS, ephemeral))).toBe(TARGET);
    expect(subsidyRows).toHaveLength(1);
  });

  it("records the subsidy and sends nothing when re-entered after a crash past the journal", async () => {
    const { chain, executor } = fakeChain();
    const state = rampState();
    await executor.execute(state);
    subsidyRows.length = 0;

    await executor.execute(state);

    expect(chain.sends).toHaveLength(2);
    expect(subsidyRows).toEqual([expect.objectContaining({ phase: "goldSettlementTopUp" })]);
  });

  it("reconciles a top-up that landed before a crash by the ephemeral balance, and does not buy again", async () => {
    let receipts = 0;
    const { chain, executor } = fakeChain({
      overrides: {
        waitForReceipt: async () => {
          receipts += 1;
          // The approval confirms; the read of the swap's receipt is lost after the swap was sent.
          if (receipts === 2) throw new Error("rpc lost");
          return { status: "success" };
        }
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    await executor.execute(state);

    expect(chain.sends).toHaveLength(2);
    expect(subsidyRows).toEqual([expect.objectContaining({ transactionHash: `0x${"2".padStart(64, "0")}` })]);
  });

  it("pauses instead of buying again when the swap after a mined approval cannot be proven", async () => {
    let sent = 0;
    const { executor } = fakeChain({
      overrides: {
        send: async () => {
          sent += 1;
          // The approval goes out; the process dies with the swap's outcome unknown.
          if (sent === 2) throw new Error("rpc lost");
          return `0x${sent.toString(16).padStart(64, "0")}`;
        }
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);

    expect(sent).toBe(2);
  });

  it("waits, sending nothing, while the funding wallet lacks the USDC", async () => {
    const { chain, executor } = fakeChain({ fundingUsdc: 403_999n });
    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(RecoverablePhaseError);
    expect(chain.sends).toEqual([]);
  });

  it("never fails the ramp when the top-up reverts", async () => {
    const { chain, executor } = fakeChain();
    chain.receiptStatus = "reverted";
    const error = await executor.execute(rampState()).catch(caught => caught);
    expect(error).toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(subsidyRows).toEqual([]);
  });

  it("stays in the phase while the ephemeral is still short after a top-up", async () => {
    const { executor } = fakeChain({
      overrides: {
        // The top-up lands, but the balance read afterwards is still below the promise.
        getTokenBalance: async (token, owner) =>
          token === BASE_USDC_ADDRESS && owner === funding ? 1_000_000_000n : TARGET - SHORTFALL
      }
    });
    await expect(executor.execute(rampState())).rejects.toBeInstanceOf(RecoverablePhaseError);
  });
});
