import { afterAll, afterEach, beforeEach, describe, expect, it } from "bun:test";
import {
  EphemeralAccountType,
  EvmToken,
  type EvmTransactionData,
  Networks,
  QuoteError,
  RampDirection,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_DEPOSITORY_ADDRESS,
  RELAY_PLACEHOLDER_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  RelayValidationError,
  type RelayQuote,
  signUnsignedTransactions,
  type UnsignedTx
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, erc20Abi, getAddress, maxUint256, parseAbi, parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../../../config/vars";
import { type FakeEvm, installFakeChainIdRpc, installFakeEvm } from "../../../../../test-utils/fake-world/fake-evm";
import { installFakeRelay } from "../../../../../test-utils/fake-world/fake-relay";
import { validatePresignedEvmTransactionAgainstUnsigned, validatePresignedTxs } from "../../../transactions/validation";
import { getEvmFundingAccount } from "../core/evm-funding";
import { aggregateNativePrefunding, allocateNonces } from "../core/prepare";
import { ROBINHOOD_STOCKS, ROBINHOOD_UNISWAP_SWAP_ROUTER_02, ROBINHOOD_USDG_ADDRESS, type StockSymbol } from "../core/robinhood-stocks";
import type { PhaseCtx, TxIntent } from "../core/types";

const { fakeRelay, restore } = installFakeRelay();

const { StockRouteBuy, StockRouteSell } = await import("../phases/stock-route");
const { simulateStockRouteBuy, simulateStockRouteSell } = await import("../phases/stock-route/simulation");
const { prepareStockRouteBuyTxs, prepareStockRouteSellTxs } = await import("../phases/stock-route/transactions");
const { swapRouter02Abi, stockSwapPath } = await import("../phases/uniswap-v3-fixed-swap/contract");
const { resolveUniswapRoute } = await import("../phases/uniswap-v3-fixed-swap/route");
const { validateUniswapApproval, validateUniswapSwap } = await import("../phases/uniswap-v3-fixed-swap/validation");

afterAll(() => {
  restore();
});

const NVDA = EvmToken.NVDA as StockSymbol;
const EPHEMERAL_KEY = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
const ephemeral = privateKeyToAccount(EPHEMERAL_KEY);
const NOW = new Date();
const NOW_MS = NOW.getTime();
const FEES = { maxFeePerGas: 30_000_000n, maxPriorityFeePerGas: 0n };
const SWAP_DEADLINE = BigInt(Math.floor(NOW_MS / 1000) + config.swap.deadlineMinutes * 60);
const DEPOSIT_ERC20_ABI = parseAbi(["function depositErc20(address depositor, address token, uint256 amount, bytes32 id)"]);
const OTHER = "0x1111111111111111111111111111111111111111";

const USDC_IN = "100000000";
// With the fake's 6 bps: 99,940,000 out of Relay, less the 2 bps drift margin.
const USDG_SWAPPED = "99920012";
const STOCK_OUT = 550_000_000_000_000_000n;
const STOCK_IN = "500000000000000000";
const USDG_OUT = 90_000_000n;
const USDC_OUT = "89946000";

const ctx = { addNote() {}, notes: [], now: NOW, partner: null, request: {} } as unknown as PhaseCtx;
const buyInput = { amount: new Big("100"), amountRaw: USDC_IN, chain: Networks.Base, token: EvmToken.USDC } as const;
const sellInput = { amount: new Big("0.5"), amountRaw: STOCK_IN, chain: Networks.Robinhood, token: NVDA } as const;

function reference(priceUsd: string, ageHours = 1) {
  return async () => ({ priceUsd: new Big(priceUsd), updatedAt: new Date(NOW_MS - ageHours * 3_600_000) });
}

type QuoteSwap = (path: `0x${string}`, amountIn: bigint, maxGasEstimate?: bigint) => Promise<bigint>;

const simulateBuy = (priceUsd = "181", quoteSwap: QuoteSwap = async () => STOCK_OUT, ageHours = 1) =>
  simulateStockRouteBuy(NVDA, buyInput, ctx, {
    quoteSwap,
    readReference: reference(priceUsd, ageHours),
    verifyDeployment: async () => {}
  });

const simulateSell = (priceUsd = "181", quoteSwap: QuoteSwap = async () => USDG_OUT, ageHours = 1) =>
  simulateStockRouteSell(NVDA, sellInput, ctx, {
    quoteSwap,
    readReference: reference(priceUsd, ageHours),
    verifyDeployment: async () => {}
  });

function prepareCtx(ownMetadata: unknown) {
  return {
    accounts: { [EphemeralAccountType.EVM]: { address: ephemeral.address, type: EphemeralAccountType.EVM } },
    globals: {},
    ownMetadata,
    ownRegistrationFacts: undefined,
    quote: {}
  } as never;
}

const transactionDependencies = { now: () => NOW_MS, probeFees: async () => FEES };

const buyMetadata = async () => (await simulateBuy()).metadata;
const sellMetadata = async () => (await simulateSell()).metadata;
const prepareBuy = async () => prepareStockRouteBuyTxs(prepareCtx(await buyMetadata()), transactionDependencies);
const prepareSell = async () => prepareStockRouteSellTxs(prepareCtx(await sellMetadata()), transactionDependencies);

const lanes = (unsigned: UnsignedTx[]) => unsigned.map(tx => [tx.phase, tx.network, tx.nonce]);

function txData(intents: readonly { phase: string; txData: unknown }[], phase: string): EvmTransactionData {
  const intent = intents.find(value => value.phase === phase);
  if (!intent) throw new Error(`no intent for ${phase}`);
  return intent.txData as EvmTransactionData;
}

/** A presigned-style record for a transaction that is not part of this block. */
const permitTransferIntent: TxIntent = {
  lane: "main",
  network: Networks.Robinhood,
  phase: "stockPermitTransfer",
  signer: ephemeral.address,
  txData: { data: "0x", gas: "100000", maxFeePerGas: "30000000", maxPriorityFeePerGas: "0", to: OTHER, value: "0" }
};

async function signAll(unsigned: UnsignedTx[]) {
  const restoreChainIdRpc = installFakeChainIdRpc();
  return signUnsignedTransactions(unsigned, {
    evmEphemeral: { address: ephemeral.address, secret: EPHEMERAL_KEY }
  }).finally(restoreChainIdRpc);
}

function decodeSwap(data: EvmTransactionData) {
  const outer = decodeFunctionData({ abi: swapRouter02Abi, data: data.data });
  if (outer.functionName !== "multicall") throw new Error("not the deadline multicall");
  const [deadline, calls] = outer.args;
  expect(calls).toHaveLength(1);
  const inner = decodeFunctionData({ abi: swapRouter02Abi, data: calls[0] });
  if (inner.functionName !== "exactInput") throw new Error("not exactInput");
  return { deadline, params: inner.args[0] };
}

beforeEach(() => {
  fakeRelay.feeBps = 6n;
  fakeRelay.quoteRequests.length = 0;
  fakeRelay.nextQuoteFault = null;
  fakeRelay.orderLifetimeSeconds = undefined;
  fakeRelay.depositAddress = undefined;
});

const DAY_S = 24 * 60 * 60;

describe("StockRoute factories", () => {
  it("buy bridges, then swaps", () => {
    const block = StockRouteBuy(NVDA);
    expect(block.context.key).toBe("stockRoute");
    expect(block.phases).toEqual(["relayBridge", "uniswapApprove", "uniswapSwap"]);
    expect(block.executors?.map(executor => executor.getPhaseName())).toEqual(block.phases);
  });

  it("sell swaps, then waits for the bridge the swap paid", () => {
    const block = StockRouteSell(NVDA);
    expect(block.context.key).toBe("stockRoute");
    expect(block.phases).toEqual(["uniswapApprove", "uniswapSwap", "relayBridge"]);
    expect(block.executors?.map(executor => executor.getPhaseName())).toEqual(block.phases);
  });
});

describe("simulateStockRouteBuy", () => {
  it("quotes Relay on the input, then swaps what Relay delivers less the drift margin", async () => {
    const swapInputs: bigint[] = [];
    const { metadata, output } = await simulateBuy("181", async (path, amountIn) => {
      expect(path).toBe(stockSwapPath(NVDA, RampDirection.BUY));
      swapInputs.push(amountIn);
      return STOCK_OUT;
    });

    expect(fakeRelay.quoteRequests).toEqual([
      expect.objectContaining({
        amount: USDC_IN,
        destinationCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
        originCurrency: RELAY_BASE_USDC_ADDRESS,
        tradeType: "EXACT_INPUT",
        user: RELAY_PLACEHOLDER_ADDRESS
      })
    ]);
    expect(swapInputs).toEqual([BigInt(USDG_SWAPPED)]);
    expect(output).toMatchObject({ amountRaw: STOCK_OUT.toString(), chain: Networks.Robinhood, token: NVDA });
    expect(output.amount.toFixed()).toBe("0.55");
    expect(output.requestInputAmountUsd?.toFixed()).toBe("99.920012");
    expect(metadata).toMatchObject({
      bridge: {
        costUsd: "0.079988",
        fromNetwork: Networks.Base,
        inputAmountRaw: USDC_IN,
        inputTokenAddress: RELAY_BASE_USDC_ADDRESS,
        outputAmountRaw: USDG_SWAPPED,
        outputTokenAddress: RELAY_ROBINHOOD_USDG_ADDRESS,
        toNetwork: Networks.Robinhood
      },
      direction: RampDirection.BUY,
      reference: { priceUsd: "181" },
      swap: {
        costUsd: "0.370012",
        hardMinimumOutputRaw: "522500000000000000",
        inputAmountRaw: USDG_SWAPPED,
        inputToken: ROBINHOOD_USDG_ADDRESS,
        network: Networks.Robinhood,
        outputAmountRaw: STOCK_OUT.toString(),
        outputToken: ROBINHOOD_STOCKS.NVDA.address,
        pools: [ROBINHOOD_STOCKS.NVDA.uniswapPool],
        router: ROBINHOOD_UNISWAP_SWAP_ROUTER_02,
        routerKind: "swapRouter02",
        softMinimumOutputRaw: "539000000000000000"
      },
      token: NVDA
    });
    expect(metadata.reference.deviationBps).toBeCloseTo(37.14, 1);
  });

  it("holds a large buy's swap to a fill the settlement cap can still top up", async () => {
    const input = { amount: new Big("21800"), amountRaw: "21800000000", chain: Networks.Base, token: EvmToken.USDC } as const;
    const { metadata, output } = await simulateStockRouteBuy(NVDA, input, ctx, {
      quoteSwap: async (_path, usdgIn) => (usdgIn * 10n ** 12n) / 181n,
      readReference: reference("181"),
      verifyDeployment: async () => {}
    });

    // A $50 cap on about $21,787 of USDG allows a fill about 0.23% short, not the usual 2%.
    const usdg = output.requestInputAmountUsd as Big;
    const expected = new Big(output.amountRaw).mul(new Big(1).minus(new Big(config.stocks.settlementSubsidyMaxUsd).div(usdg)));
    expect(metadata.swap.softMinimumOutputRaw).toBe(expected.toFixed(0, 0));
    expect(BigInt(metadata.swap.softMinimumOutputRaw)).toBeGreaterThan((BigInt(output.amountRaw) * 9_970n) / 10_000n);
  });

  it("bounds the swap's quoted gas in both directions", async () => {
    const bounds: unknown[] = [];
    const quoteSwap = async (_path: `0x${string}`, amountIn: bigint, maxGasEstimate?: bigint) => {
      bounds.push(maxGasEstimate);
      return amountIn === BigInt(STOCK_IN) ? USDG_OUT : STOCK_OUT;
    };
    await simulateBuy("181", quoteSwap);
    await simulateSell("181", quoteSwap);
    expect(bounds).toEqual([900_000n, 900_000n]);
  });

  it("is rejected with the price message when the fill is 3% worse than the reference", async () => {
    await expect(simulateBuy("176")).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.StockPriceUnavailable,
      status: 503
    });
  });

  it("passes a fill 3% better than the reference, reporting a negative cost", async () => {
    const { metadata } = await simulateBuy("187");
    expect(metadata.reference.deviationBps).toBeLessThan(0);
    expect(Number(metadata.swap.costUsd)).toBeLessThan(0);
  });

  it("fails closed on a stale reference", async () => {
    await expect(simulateBuy("181", undefined, config.stocks.priceReferenceMaxAgeHours + 1)).rejects.toMatchObject({
      message: QuoteError.StockPriceUnavailable,
      status: 503
    });
  });

  it("rejects a swap that returns nothing", async () => {
    await expect(simulateBuy("181", async () => 0n)).rejects.toThrow("Uniswap returned no NVDA");
  });

  it("verifies the deployment before quoting", async () => {
    await expect(
      simulateStockRouteBuy(NVDA, buyInput, ctx, {
        quoteSwap: async () => {
          throw new Error("must not quote");
        },
        readReference: reference("181"),
        verifyDeployment: async () => {
          throw new Error("does not match the pinned route");
        }
      })
    ).rejects.toThrow("does not match the pinned route");
    expect(fakeRelay.quoteRequests).toHaveLength(0);
  });

  it.each([
    ["chain", { chain: Networks.Polygon }],
    ["token", { token: EvmToken.USDT }],
    ["amount", { amountRaw: "0" }]
  ])("rejects an input with a wrong %s", async (_label, patch) => {
    await expect(simulateStockRouteBuy(NVDA, { ...buyInput, ...patch } as never, ctx, {})).rejects.toThrow("StockRoute requires");
  });
});

describe("simulateStockRouteSell", () => {
  it("swaps the input, then quotes Relay on the swap output with the strict flags", async () => {
    const { metadata, output } = await simulateSell();

    expect(fakeRelay.quoteRequests).toEqual([
      expect.objectContaining({
        amount: USDG_OUT.toString(),
        destinationCurrency: RELAY_BASE_USDC_ADDRESS,
        originCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
        refundTo: RELAY_PLACEHOLDER_ADDRESS,
        slippageTolerance: "50",
        strict: true,
        tradeType: "EXACT_INPUT",
        useDepositAddress: true,
        user: RELAY_PLACEHOLDER_ADDRESS
      })
    ]);
    expect(output).toMatchObject({ amountRaw: USDC_OUT, chain: Networks.Base, token: EvmToken.USDC });
    expect(output.amount.toFixed()).toBe("89.946");
    expect(output.requestInputAmountUsd?.toFixed()).toBe("89.946");
    expect(metadata).toMatchObject({
      bridge: {
        costUsd: "0.054000",
        fromNetwork: Networks.Robinhood,
        inputAmountRaw: USDG_OUT.toString(),
        inputTokenAddress: RELAY_ROBINHOOD_USDG_ADDRESS,
        outputAmountRaw: USDC_OUT,
        outputTokenAddress: RELAY_BASE_USDC_ADDRESS,
        toNetwork: Networks.Base
      },
      direction: RampDirection.SELL,
      swap: {
        costUsd: "0.500000",
        hardMinimumOutputRaw: "85500000",
        inputAmountRaw: STOCK_IN,
        inputToken: ROBINHOOD_STOCKS.NVDA.address,
        outputAmountRaw: USDG_OUT.toString(),
        outputToken: ROBINHOOD_USDG_ADDRESS,
        softMinimumOutputRaw: "88200000"
      }
    });
  });

  it("is rejected with the price message when the fill is 3% below the reference, before Relay is asked", async () => {
    await expect(simulateSell("186")).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.StockPriceUnavailable,
      status: 503
    });
    expect(fakeRelay.quoteRequests).toHaveLength(0);
  });

  it("passes a fill 3% above the reference", async () => {
    const { metadata } = await simulateSell("174.5");
    expect(metadata.reference.deviationBps).toBeLessThan(0);
  });

  it("fails closed on a stale reference", async () => {
    await expect(simulateSell("181", undefined, config.stocks.priceReferenceMaxAgeHours + 1)).rejects.toMatchObject({
      message: QuoteError.StockPriceUnavailable
    });
  });
});

describe("prepareStockRouteBuyTxs", () => {
  it("orders exactly Y for the ephemeral", async () => {
    const metadata = await buyMetadata();
    fakeRelay.quoteRequests.length = 0;
    await prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies);
    expect(fakeRelay.quoteRequests).toEqual([
      expect.objectContaining({
        amount: USDG_SWAPPED,
        destinationCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
        includeProtocolData: true,
        originCurrency: RELAY_BASE_USDC_ADDRESS,
        recipient: ephemeral.address,
        refundTo: ephemeral.address,
        tradeType: "EXACT_OUTPUT",
        user: ephemeral.address
      })
    ]);
  });

  it("orders a $5 buy within its quoted input, despite the fixed part of Relay's EXACT_OUTPUT cost", async () => {
    const { metadata } = await simulateStockRouteBuy(NVDA, { ...buyInput, amount: new Big("5"), amountRaw: "5000000" }, ctx, {
      quoteSwap: async (_path, amountIn) => (amountIn * 10n ** 12n) / 181n,
      readReference: reference("181"),
      verifyDeployment: async () => {}
    });
    const { state } = await prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies);
    expect(BigInt((state as Record<string, string>).relayInputAmountRaw)).toBeLessThanOrEqual(5_000_000n);
  });

  it("allocates the Base and 4663 lanes, with the backup on the first 4663 nonce", async () => {
    const { intents } = await prepareBuy();
    expect(lanes(allocateNonces(intents))).toEqual([
      ["relayApprove", Networks.Base, 0],
      ["relayBridge", Networks.Base, 1],
      ["uniswapApprove", Networks.Robinhood, 0],
      ["uniswapSwap", Networks.Robinhood, 1],
      ["stockBackupApprove", Networks.Robinhood, 0]
    ]);
  });

  it("sets gas and both fee fields on every transaction, as strings", async () => {
    const { intents } = await prepareBuy();
    expect(intents.map(intent => {
      const { gas, maxFeePerGas, maxPriorityFeePerGas, value } = intent.txData as EvmTransactionData;
      return [intent.phase, gas, maxFeePerGas, maxPriorityFeePerGas, value];
    })).toEqual([
      ["relayApprove", "73112", "6500000", "1000000", "0"],
      ["relayBridge", "75909", "6500000", "1000000", "0"],
      ["uniswapApprove", "100000", "30000000", "0", "0"],
      // Covers the ~840k a swap at the corridor limit was measured to use.
      ["uniswapSwap", "1200000", "30000000", "0", "0"],
      ["stockBackupApprove", "100000", "30000000", "0", "0"]
    ]);
  });

  it("prefunds the two 4663 main transactions at the worst-case fee, and nothing Relay priced", async () => {
    const { intents } = await prepareBuy();
    expect(aggregateNativePrefunding(intents)).toEqual({
      [`${Networks.Robinhood}:${ephemeral.address.toLowerCase()}`]: ((100_000n + 1_200_000n) * FEES.maxFeePerGas * 3n).toString()
    });
    expect(intents.find(intent => intent.phase === "uniswapApprove")?.prefundNativeValueRaw).toBeDefined();
    expect(intents.find(intent => intent.phase === "uniswapSwap")?.prefundNativeValueRaw).toBeDefined();
  });

  it("decodes to the pinned approve, deposit, swap and backup", async () => {
    const { intents, state } = await prepareBuy();
    const { relayInputAmountRaw, relayRequestId, swapDeadline } = state as Record<string, string>;
    const order = fakeRelay.quotes.get(relayRequestId) as RelayQuote;
    expect(BigInt(relayInputAmountRaw)).toBeLessThanOrEqual(BigInt(USDC_IN));
    expect(swapDeadline).toBe(SWAP_DEADLINE.toString());

    const approve = txData(intents, "relayApprove");
    expect(approve.to.toLowerCase()).toBe(RELAY_BASE_USDC_ADDRESS.toLowerCase());
    const decodedApprove = decodeFunctionData({ abi: erc20Abi, data: approve.data });
    expect(decodedApprove.functionName).toBe("approve");
    expect(decodedApprove.args?.[0]?.toString().toLowerCase()).toBe(RELAY_DEPOSITORY_ADDRESS);
    expect(decodedApprove.args?.[1]).toBe(BigInt(relayInputAmountRaw));

    const deposit = txData(intents, "relayBridge");
    expect(deposit.to.toLowerCase()).toBe(RELAY_DEPOSITORY_ADDRESS);
    const decodedDeposit = decodeFunctionData({ abi: DEPOSIT_ERC20_ABI, data: deposit.data });
    expect(decodedDeposit.args[0]).toBe(ephemeral.address);
    expect(decodedDeposit.args[1].toLowerCase()).toBe(RELAY_BASE_USDC_ADDRESS.toLowerCase());
    expect(decodedDeposit.args[2]).toBe(BigInt(relayInputAmountRaw));
    expect(decodedDeposit.args[3]).toBe(order.protocol.v2.orderId as `0x${string}`);

    const uniswapApprove = txData(intents, "uniswapApprove");
    expect(uniswapApprove.to).toBe(ROBINHOOD_USDG_ADDRESS);
    expect(decodeFunctionData({ abi: erc20Abi, data: uniswapApprove.data }).args).toEqual([
      getAddress(ROBINHOOD_UNISWAP_SWAP_ROUTER_02),
      BigInt(USDG_SWAPPED)
    ] as never);

    const swap = txData(intents, "uniswapSwap");
    expect(swap.to).toBe(ROBINHOOD_UNISWAP_SWAP_ROUTER_02);
    const { deadline, params } = decodeSwap(swap);
    expect(deadline).toBe(SWAP_DEADLINE);
    expect(params).toEqual({
      amountIn: BigInt(USDG_SWAPPED),
      amountOutMinimum: 522_500_000_000_000_000n,
      path: stockSwapPath(NVDA, RampDirection.BUY),
      recipient: ephemeral.address
    });

    const backup = txData(intents, "stockBackupApprove");
    expect(backup.to).toBe(ROBINHOOD_USDG_ADDRESS);
    expect(decodeFunctionData({ abi: erc20Abi, data: backup.data }).args).toEqual([
      getEvmFundingAccount(Networks.Robinhood).address,
      BigInt(USDG_SWAPPED)
    ] as never);
  });

  it("asks for a new quote when the order costs more than the quote committed", async () => {
    const metadata = await buyMetadata();
    fakeRelay.feeBps = 20n;
    await expect(prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({
      isPublic: true,
      message: expect.stringContaining("request a new quote"),
      status: 503
    });
  });

  it("refuses an order that ends before a paid ramp can no longer be recovered", async () => {
    const metadata = await buyMetadata();
    fakeRelay.orderLifetimeSeconds = 4 * DAY_S - 60;
    await expect(prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({
      check: "output.deadline"
    });
  });

  it("asks for a new quote when Relay is unreachable", async () => {
    const metadata = await buyMetadata();
    fakeRelay.nextQuoteFault = "timeout";
    await expect(prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({ status: 503 });
  });

  it("fails hard on an order that does not validate, without a retryable answer", async () => {
    const metadata = await buyMetadata();
    const realGetQuote = fakeRelay.getQuote.bind(fakeRelay);
    fakeRelay.getQuote = async request => {
      const quote = await realGetQuote(request);
      quote.protocol.v2.paymentDetails.depository = OTHER;
      return quote;
    };
    try {
      await expect(prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies)).rejects.toBeInstanceOf(
        RelayValidationError
      );
    } finally {
      fakeRelay.getQuote = realGetQuote;
    }
  });

  it("rejects an order without gas, which signing would price at the 187.5 gwei fallback", async () => {
    const metadata = await buyMetadata();
    const realGetQuote = fakeRelay.getQuote.bind(fakeRelay);
    fakeRelay.getQuote = async request => {
      const quote = await realGetQuote(request);
      delete quote.steps[1].items[0].data.gas;
      return quote;
    };
    try {
      await expect(prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies)).rejects.toThrow("deposit.gas");
    } finally {
      fakeRelay.getQuote = realGetQuote;
    }
  });

  it("produces what the Uniswap executors accept, and the validators accept once signed", async () => {
    const metadata = await buyMetadata();
    const { intents, state } = await prepareStockRouteBuyTxs(prepareCtx(metadata), transactionDependencies);
    const route = resolveUniswapRoute(
      { blocks: { stockRoute: metadata } },
      { blockState: { stockRoute: state } } as never,
      ephemeral.address
    );
    expect(route.recipient).toBe(ephemeral.address);

    const unsigned = allocateNonces(intents);
    const signed = await signAll(unsigned);
    const byPhase = (phase: string) => signed.find(tx => tx.phase === phase) as (typeof signed)[number];
    await validateUniswapApproval(byPhase("uniswapApprove"), route);
    await validateUniswapSwap(byPhase("uniswapSwap"), route);
    for (const tx of unsigned) {
      await validatePresignedEvmTransactionAgainstUnsigned(byPhase(tx.phase), tx);
    }
  });
});

describe("prepareStockRouteSellTxs", () => {
  it("orders the swap's hard minimum through a strict deposit address, refunding to the ephemeral", async () => {
    const metadata = await sellMetadata();
    fakeRelay.quoteRequests.length = 0;
    await prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies);
    expect(fakeRelay.quoteRequests).toEqual([
      expect.objectContaining({
        amount: "85500000",
        includeProtocolData: true,
        originCurrency: RELAY_ROBINHOOD_USDG_ADDRESS,
        recipient: ephemeral.address,
        refundTo: ephemeral.address,
        slippageTolerance: "50",
        strict: true,
        tradeType: "EXACT_INPUT",
        useDepositAddress: true,
        user: ephemeral.address
      })
    ]);
  });

  it("has no Relay transaction: the swap pays the deposit address, and both backups share the first nonce", async () => {
    const { intents, state } = await prepareSell();
    expect(lanes(allocateNonces(intents))).toEqual([
      ["uniswapApprove", Networks.Robinhood, 0],
      ["uniswapSwap", Networks.Robinhood, 1],
      ["stockBackupApprove", Networks.Robinhood, 0],
      ["relayBackupApprove", Networks.Robinhood, 0]
    ]);

    const { relayDepositAddress, relayMinimumOutputRaw, relayRequestId, swapDeadline } = state as Record<string, string>;
    const order = fakeRelay.quotes.get(relayRequestId) as RelayQuote;
    expect(relayDepositAddress).toBe(order.steps[0].depositAddress as string);
    expect(relayMinimumOutputRaw).toBe(order.protocol.v2.orderData.output.payments[0].minimumAmount);
    expect(swapDeadline).toBe(SWAP_DEADLINE.toString());

    const { deadline, params } = decodeSwap(txData(intents, "uniswapSwap"));
    expect(deadline).toBe(SWAP_DEADLINE);
    expect(params).toEqual({
      amountIn: BigInt(STOCK_IN),
      amountOutMinimum: 85_500_000n,
      path: stockSwapPath(NVDA, RampDirection.SELL),
      recipient: relayDepositAddress as `0x${string}`
    });
  });

  it("sets fee fields and prefunding on the 4663 main transactions, and approves the funding account on the backups", async () => {
    const { intents } = await prepareSell();
    const funding = getEvmFundingAccount(Networks.Robinhood).address;
    for (const intent of intents) {
      const { gas, maxFeePerGas, maxPriorityFeePerGas } = intent.txData as EvmTransactionData;
      expect([typeof gas, maxFeePerGas, maxPriorityFeePerGas]).toEqual(["string", "30000000", "0"]);
    }
    expect(aggregateNativePrefunding(intents)).toEqual({
      [`${Networks.Robinhood}:${ephemeral.address.toLowerCase()}`]: ((100_000n + 1_200_000n) * FEES.maxFeePerGas * 3n).toString()
    });

    const stockBackup = txData(intents, "stockBackupApprove");
    expect(stockBackup.to).toBe(ROBINHOOD_STOCKS.NVDA.address);
    expect(decodeFunctionData({ abi: erc20Abi, data: stockBackup.data }).args).toEqual([funding, BigInt(STOCK_IN)] as never);

    const relayBackup = txData(intents, "relayBackupApprove");
    expect(relayBackup.to).toBe(RELAY_ROBINHOOD_USDG_ADDRESS);
    expect(decodeFunctionData({ abi: erc20Abi, data: relayBackup.data }).args).toEqual([funding, maxUint256] as never);
  });

  it("asks for a new quote when the order guarantees too little of the quoted output", async () => {
    const metadata = await sellMetadata();
    fakeRelay.feeBps = 200n;
    await expect(prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({
      isPublic: true,
      status: 503
    });
  });

  it("refuses an order that ends before the swap's deadline", async () => {
    const metadata = await sellMetadata();
    fakeRelay.orderLifetimeSeconds = config.swap.deadlineMinutes * 60 - 60;
    await expect(prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({
      check: "output.deadline"
    });
  });

  it("refuses the swap router as the deposit address", async () => {
    const metadata = await sellMetadata();
    fakeRelay.depositAddress = ROBINHOOD_UNISWAP_SWAP_ROUTER_02;
    await expect(prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies)).rejects.toMatchObject({
      check: "depositAddress"
    });
  });

  it("fails hard on a recomputed order id mismatch", async () => {
    const metadata = await sellMetadata();
    const realGetQuote = fakeRelay.getQuote.bind(fakeRelay);
    fakeRelay.getQuote = async request => {
      const quote = await realGetQuote(request);
      quote.protocol.v2.orderData.output.payments[0].recipient = OTHER;
      return quote;
    };
    try {
      await expect(prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies)).rejects.toBeInstanceOf(
        RelayValidationError
      );
    } finally {
      fakeRelay.getQuote = realGetQuote;
    }
  });

  it("produces what the Uniswap executors accept, recipient being the deposit address", async () => {
    const metadata = await sellMetadata();
    const { intents, state } = await prepareStockRouteSellTxs(prepareCtx(metadata), transactionDependencies);
    const route = resolveUniswapRoute(
      { blocks: { stockRoute: metadata } },
      { blockState: { stockRoute: state } } as never,
      ephemeral.address
    );
    expect(route.recipient).toBe((state as Record<string, string>).relayDepositAddress as `0x${string}`);

    const signed = await signAll(allocateNonces(intents));
    await validateUniswapApproval(signed.find(tx => tx.phase === "uniswapApprove") as never, route);
    await validateUniswapSwap(signed.find(tx => tx.phase === "uniswapSwap") as never, route);
  });
});

describe("backups stay reachable through the five signed nonces", () => {
  async function signedSell() {
    const { intents } = await prepareSell();
    const unsigned = allocateNonces([permitTransferIntent, ...intents]);
    return { signed: await signAll(unsigned), unsigned };
  }

  function variantAtNonce(tx: { meta?: { additionalTxs?: Record<string, { nonce: number; txData: unknown }> } }, nonce: number) {
    const variant = Object.values(tx.meta?.additionalTxs ?? {}).find(value => value.nonce === nonce);
    if (!variant) throw new Error(`no signed variant at nonce ${nonce}`);
    return parseTransaction(variant.txData as `0x${string}`);
  }

  it("sell: permit transfer, approve and swap spend nonces 0 to 2, and a Relay refund is still recoverable at 3", async () => {
    const { signed, unsigned } = await signedSell();
    expect(lanes(unsigned)).toEqual([
      ["stockPermitTransfer", Networks.Robinhood, 0],
      ["uniswapApprove", Networks.Robinhood, 1],
      ["uniswapSwap", Networks.Robinhood, 2],
      ["stockBackupApprove", Networks.Robinhood, 0],
      ["relayBackupApprove", Networks.Robinhood, 0]
    ]);
    const relayBackup = signed.find(tx => tx.phase === "relayBackupApprove") as never;
    const atThree = variantAtNonce(relayBackup, 3);
    expect(atThree.chainId).toBe(4663);
    expect(atThree.to?.toLowerCase()).toBe(RELAY_ROBINHOOD_USDG_ADDRESS.toLowerCase());
    expect(decodeFunctionData({ abi: erc20Abi, data: atThree.data as `0x${string}` }).args).toEqual([
      getEvmFundingAccount(Networks.Robinhood).address,
      maxUint256
    ] as never);
  });

  it("sell: a held swap's stock is recoverable at the nonce right after the permit transfer", async () => {
    const { signed } = await signedSell();
    const atOne = variantAtNonce(signed.find(tx => tx.phase === "stockBackupApprove") as never, 1);
    expect(atOne.to).toBe(ROBINHOOD_STOCKS.NVDA.address.toLowerCase() as `0x${string}`);
  });

  it("buy: USDG held after the approval burned nonce 0 is recoverable at nonce 1", async () => {
    const { intents } = await prepareBuy();
    const signed = await signAll(allocateNonces(intents));
    const atOne = variantAtNonce(signed.find(tx => tx.phase === "stockBackupApprove") as never, 1);
    expect(atOne.to).toBe(RELAY_ROBINHOOD_USDG_ADDRESS.toLowerCase() as `0x${string}`);
  });

  it("the full presign check accepts every transaction with its five signed nonces", async () => {
    const { intents } = await prepareBuy();
    const unsigned = allocateNonces(intents);
    const signed = await signAll(unsigned);
    expect(signed).toHaveLength(unsigned.length);
    await validatePresignedTxs(
      RampDirection.BUY,
      signed,
      { EVM: ephemeral.address, Substrate: "" } as never,
      unsigned as never
    );
  });
});

describe("StockRoute register", () => {
  let fakeEvm: FakeEvm;
  let restoreEvm: () => void;

  beforeEach(() => {
    ({ fakeEvm, restore: restoreEvm } = installFakeEvm());
  });

  afterEach(() => {
    restoreEvm();
  });

  const register = (factory: typeof StockRouteBuy | typeof StockRouteSell) =>
    (factory(NVDA) as { register: (ctx: never) => Promise<unknown> }).register({} as never);

  it.each([
    ["buy", StockRouteBuy],
    ["sell", StockRouteSell]
  ] as const)("%s registers while the issuer has not paused the token", async (_label, factory) => {
    fakeEvm.onReadContract = () => false;
    await expect(register(factory)).resolves.toEqual({ facts: {} });
  });

  it.each(["paused", "oraclePaused"])("rejects with the pause message when %s is set", async flag => {
    fakeEvm.onReadContract = (_network, params) => params.functionName === flag;
    await expect(register(StockRouteBuy)).rejects.toMatchObject({
      isPublic: true,
      message: QuoteError.StockTradingPaused,
      status: 503
    });
  });

  it("fails closed when the flags cannot be read", async () => {
    fakeEvm.onReadContract = () => {
      throw new Error("rpc down");
    };
    await expect(register(StockRouteSell)).rejects.toMatchObject({ message: QuoteError.StockTradingPaused });
  });
});
