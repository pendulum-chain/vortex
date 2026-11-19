import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { type EvmTokenDetails, EvmToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import {
  decodeFunctionData,
  encodeAbiParameters,
  encodeEventTopics,
  encodeFunctionData,
  erc20Abi,
  EstimateGasExecutionError,
  ExecutionRevertedError,
  keccak256
} from "viem";
import logger from "../../../../../config/logger";
import * as financialOperationModelNamespace from "../../../../../models/financialOperation.model";
import * as quoteTicketNamespace from "../../../../../models/quoteTicket.model";
import { priceFeedService } from "../../../priceFeed.service";
import * as evmFundingNamespace from "../core/evm-funding";
import * as financialOperationNamespace from "../core/financial-operation";

// Characterization of the EVM top-up path shared by SubsidizePreSwapExecutor and
// SubsidizePostSwapExecutor: every message, attempt class, request key and call
// argument is pinned for both executors so the two stay behaviourally identical.

const sharedReal = { ...sharedNamespace };
const quoteTicketReal = { ...quoteTicketNamespace };
const financialOperationModelReal = { ...financialOperationModelNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const financialOperationReal = { ...financialOperationNamespace };

const EPHEMERAL = "0x2222222222222222222222222222222222222222" as const;
const TX_HASH = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };
const usdcAddress = (sharedReal.getOnChainTokenDetails(Networks.Base, EvmToken.USDC) as EvmTokenDetails)
  .erc20AddressSourceChain as `0x${string}`;

const findQuote = mock(async () => undefined as unknown);
// The confirmed mint ticket of the ramp, as the pre-swap top-up after a provider mint reads it.
const findMintTicket = mock(async (_query?: unknown) => null as { response: unknown } | null);
const checkBalance = mock(async () => new Big(0));
// Faithful to the real poller: resolves only at or above the desired amount and throws a Timeout otherwise.
const checkEvmBalanceImpl = async ({ amountDesiredRaw }: { amountDesiredRaw: string }) => {
  const balance = await checkBalance();
  if (balance.lt(amountDesiredRaw)) {
    throw new sharedReal.BalanceCheckError(
      sharedReal.BalanceCheckErrorType.Timeout,
      "Balance did not meet the limit within 5000ms"
    );
  }
  return balance;
};
const checkEvmBalanceForToken = mock(checkEvmBalanceImpl);
const getFundingBalance = mock(async () => new Big("1000000000"));
const getDestinationBalance = mock(async () => checkBalance());
const getNativeFundingBalance = mock(async () => new Big("1000000000"));
const estimateFeesPerGas = mock(
  async (): Promise<{ gasPrice?: bigint; maxFeePerGas?: bigint; maxPriorityFeePerGas?: bigint }> => ({
    maxFeePerGas: 10n,
    maxPriorityFeePerGas: 1n
  })
);
const sendTransaction = mock(
  async (_network?: unknown, _account?: unknown, _transaction?: unknown) => TX_HASH as `0x${string}`
);
const estimateGas = mock(async (_args?: unknown) => 21000n);
const getTransaction = mock(
  async (_args?: unknown): Promise<{ from: `0x${string}`; input: `0x${string}`; to: `0x${string}` }> => {
    throw new Error("Unexpected transaction lookup");
  }
);
const getTransactionCount = mock(async (_args?: unknown) => 7);
const waitForTransactionReceipt = mock(async (_args?: unknown) => ({ status: "success" as "reverted" | "success" }));
// Receipts of the transactions a top-up is measured against, by hash. An unlisted hash has a receipt without transfers.
const SWAP_TX = "0x02aa" as const;
const FEE_TX = "0x02bb" as const;
const DEPOSIT_HASH = "0x3333333333333333333333333333333333333333333333333333333333333333" as const;
const OTHER = "0x4444444444444444444444444444444444444444" as const;
const receipts = new Map<string, { logs: unknown[]; status: "reverted" | "success" }>();
const getTransactionReceipt = mock(async ({ hash }: { hash: string }) => receipts.get(hash) ?? { logs: [], status: "success" });
const usdcTransfer = (from: `0x${string}`, to: `0x${string}`, value: bigint) => ({
  address: usdcAddress,
  data: encodeAbiParameters([{ type: "uint256" }], [value]),
  topics: encodeEventTopics({ abi: erc20Abi, args: { from, to }, eventName: "Transfer" })
});

const operationFailures: unknown[] = [];
let operationReplay: unknown;
let legacyOperationResponse: unknown;
let beforeSerializedFundingOperation: (() => Promise<void> | void) | undefined;
const runSerializedEvmFundingOperation = mock(async (_network: unknown, operation: () => Promise<unknown>) => {
  await beforeSerializedFundingOperation?.();
  return operation();
});
const runFinancialOperation = mock(
  async (args: {
    beforePerform?(): Promise<void>;
    perform(key: string): Promise<unknown>;
    reconcile?(operation: { response: unknown }): Promise<unknown | null>;
    signal?: AbortSignal;
  }) => {
    if (args.signal?.aborted) throw args.signal.reason;
    if (operationReplay !== undefined) return operationReplay;
    if (legacyOperationResponse !== undefined) {
      const reconciled = await args.reconcile?.({ response: legacyOperationResponse });
      if (reconciled === null || reconciled === undefined) throw new Error("Legacy operation requires reconciliation");
      return reconciled;
    }
    try {
      await args.beforePerform?.();
      return await args.perform("test-operation-key");
    } catch (error) {
      operationFailures.push(error);
      throw error;
    }
  }
);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        chain: { nativeCurrency: { decimals: 18 } },
        estimateFeesPerGas,
        estimateGas,
        getTransaction,
        getTransactionCount,
        getTransactionReceipt,
        readContract: async () => 10000n,
        waitForTransactionReceipt
      }),
      sendTransactionWithBlindRetry: sendTransaction
    })
  },
  getEvmBalance: ({ ownerAddress }: { ownerAddress: string }) =>
    ownerAddress.toLowerCase() === fundingAccount.address.toLowerCase() ? getFundingBalance() : getDestinationBalance(),
  getEvmNativeBalance: getNativeFundingBalance
}));
mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuote }
}));
mock.module("../../../../../models/financialOperation.model", () => ({
  ...financialOperationModelReal,
  default: { findOne: findMintTicket }
}));
mock.module("../core/evm-funding", () => ({
  ...evmFundingReal,
  getEvmFundingAccount: () => fundingAccount,
  runSerializedEvmFundingOperation
}));
mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation
}));
const { SubsidizePreSwapExecutor } = await import("../phases/subsidize-pre/execution");
const { SubsidizePostSwapExecutor } = await import("../phases/subsidize-post/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
  mock.module("../../../../../models/financialOperation.model", () => ({ ...financialOperationModelReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

const originalConvertCurrency = priceFeedService.convertCurrency;
let conversions: string[] = [];
let loggerError: ReturnType<typeof spyOn<typeof logger, "error">>;

beforeEach(() => {
  // mockReset (not mockClear) so unconsumed mockResolvedValueOnce entries cannot leak into the next test.
  for (const fn of [
    findQuote,
    findMintTicket,
    checkBalance,
    checkEvmBalanceForToken,
    getFundingBalance,
    getDestinationBalance,
    getNativeFundingBalance,
    estimateFeesPerGas,
    sendTransaction,
    estimateGas,
    getTransaction,
    getTransactionCount,
    waitForTransactionReceipt
  ]) {
    fn.mockReset();
  }
  getTransactionReceipt.mockClear();
  receipts.clear();
  runSerializedEvmFundingOperation.mockClear();
  runFinancialOperation.mockClear();
  checkEvmBalanceForToken.mockImplementation(checkEvmBalanceImpl);
  checkBalance.mockResolvedValue(new Big(0));
  findMintTicket.mockResolvedValue(null);
  getFundingBalance.mockResolvedValue(new Big("1000000000"));
  getDestinationBalance.mockImplementation(async () => checkBalance());
  getNativeFundingBalance.mockResolvedValue(new Big("1000000000"));
  estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n });
  sendTransaction.mockImplementation(async () => TX_HASH);
  estimateGas.mockResolvedValue(21000n);
  getTransaction.mockImplementation(async () => {
    throw new Error("Unexpected transaction lookup");
  });
  getTransactionCount.mockResolvedValue(7);
  waitForTransactionReceipt.mockResolvedValue({ status: "success" });
  beforeSerializedFundingOperation = undefined;
  operationFailures.length = 0;
  operationReplay = undefined;
  legacyOperationResponse = undefined;
  conversions = [];
  priceFeedService.convertCurrency = mock(async amount => {
    conversions.push(String(amount));
    return String(amount);
  }) as typeof priceFeedService.convertCurrency;
  loggerError = spyOn(logger, "error").mockImplementation((() => logger) as never);
});

afterEach(() => {
  priceFeedService.convertCurrency = originalConvertCurrency;
  loggerError.mockRestore();
});

type Executor = {
  createSubsidy: ReturnType<typeof mock>;
  executePhase(state: unknown, signal?: AbortSignal): Promise<unknown>;
  getPhaseName(): string;
};

interface Case {
  /** Quote metadata whose top-up needs 5 USDC (current 95, target 100) and whose quote output is $100. */
  baseMetadata: Record<string, unknown>;
  /** Block metadata for a shortfall of `shortfallRaw` against a 100 USDC target, quote output $100. */
  capBreach: { balanceRaw: string; message: string; metadata: Record<string, unknown>; quoteOutput: string };
  direction: RampDirection;
  name: string;
  executorName: string;
  make(): Executor;
  metadataKey: string;
  phaseName: string;
  stateLabel: string;
}

const preMetadata = (overrides: Record<string, unknown> = {}) => ({
  blocks: {
    subsidizePreSwap: {
      expectedOutputAmountDecimal: "100",
      expectedOutputAmountRaw: "100000000",
      inputCurrency: EvmToken.USDC,
      inputDecimals: 6,
      network: Networks.Base,
      targetInputAmountRaw: "100000000",
      ...overrides
    }
  }
});

const postMetadata = (overrides: Record<string, unknown> = {}) => ({
  blocks: {
    subsidizePostSwap: {
      actualOutputAmountRaw: "95000000",
      outputCurrency: EvmToken.USDC,
      outputDecimals: 6,
      subsidyAmountInOutputTokenRaw: "5000000",
      targetOutputAmountRaw: "100000000",
      ...overrides
    }
  }
});

const cases: Case[] = [
  {
    baseMetadata: preMetadata(),
    capBreach: {
      balanceRaw: "50000000",
      message: "SubsidizePreSwapExecutor: Required subsidy $50 exceeds cap $5.00 (max of $1.00 and 0.05 of quote output $100).",
      metadata: preMetadata(),
      quoteOutput: "100"
    },
    direction: RampDirection.SELL,
    executorName: "SubsidizePreSwapExecutor",
    make: () => Object.create(SubsidizePreSwapExecutor.prototype) as Executor,
    metadataKey: "subsidizePreSwap",
    name: "SubsidizePreSwapExecutor",
    phaseName: "subsidizePreSwap",
    stateLabel: "pre swap"
  },
  {
    baseMetadata: postMetadata(),
    capBreach: {
      balanceRaw: "50000000",
      // discrepancy baseline equals the target, so the whole shortfall is a swap discrepancy
      message:
        "SubsidizePostSwapExecutor: Required swap discrepancy subsidy $50 exceeds cap $5.00 (max of $1.00 and 0.05 of quote output $100).",
      metadata: postMetadata({ actualOutputAmountRaw: "100000000", subsidyAmountInOutputTokenRaw: "0" }),
      quoteOutput: "100"
    },
    direction: RampDirection.BUY,
    executorName: "SubsidizePostSwapExecutor",
    make: () => Object.create(SubsidizePostSwapExecutor.prototype) as Executor,
    metadataKey: "subsidizePostSwap",
    name: "SubsidizePostSwapExecutor",
    phaseName: "subsidizePostSwap",
    stateLabel: "post swap"
  }
];

// The ephemeral's presigned swap and one fee transfer, as every ramp that reaches these phases carries them.
const presignedTxs = [
  { network: Networks.Base, phase: "nablaSwap", txData: SWAP_TX },
  { network: Networks.Base, phase: "distributeFees", txData: FEE_TX }
];

function makeState(
  testCase: Case,
  state: Record<string, unknown> = { evmEphemeralAddress: EPHEMERAL },
  presigned: unknown[] = presignedTxs,
  unsignedTxs: unknown[] = []
) {
  return { id: "ramp-1", presignedTxs: presigned, quoteId: "quote-1", state, type: testCase.direction, unsignedTxs };
}

function arrange(testCase: Case, metadata: Record<string, unknown>, quoteOutput = "100") {
  findQuote.mockResolvedValue({ metadata, outputAmount: quoteOutput, outputCurrency: EvmToken.USDC });
  const executor = testCase.make();
  executor.createSubsidy = mock(async () => undefined);
  return executor;
}

/** Preflight sees `balanceRaw`; the confirmation poll afterwards sees the full 100 USDC target. */
function balances(balanceRaw: string, finalRaw = "100000000") {
  checkBalance.mockResolvedValue(new Big(finalRaw));
  checkBalance.mockResolvedValueOnce(new Big(balanceRaw));
  getDestinationBalance.mockResolvedValue(new Big(balanceRaw));
}

describe.each(cases)("$name EVM top-up", testCase => {
  const { executorName } = testCase;

  it("sends the capped top-up from the funding wallet and records the subsidy", async () => {
    balances("95000000");
    const executor = arrange(testCase, testCase.baseMetadata);

    await executor.executePhase(makeState(testCase));

    expect(runSerializedEvmFundingOperation).toHaveBeenCalledTimes(1);
    expect(runSerializedEvmFundingOperation.mock.calls[0][0]).toBe(Networks.Base);
    expect(runFinancialOperation).toHaveBeenCalledTimes(1);
    const operationArgs = runFinancialOperation.mock.calls[0][0] as Record<string, any>;
    expect(operationArgs).toMatchObject({
      adoptSafeRequestHash: true,
      attemptClass: "evm-subsidy-transfer",
      provider: Networks.Base,
      reconcileRequestMismatch: true,
      request: {
        destination: EPHEMERAL,
        network: Networks.Base,
        source: fundingAccount.address,
        targetBalanceRaw: "100000000",
        token: usdcAddress
      },
      retryFailed: true,
      settleAfterAbort: true
    });
    expect(Object.keys(operationArgs.request).sort()).toEqual([
      "destination",
      "network",
      "source",
      "targetBalanceRaw",
      "token"
    ]);
    expect(operationArgs.externalId({ amountRaw: "5000000", hash: TX_HASH })).toBe(TX_HASH);
    expect(operationArgs.externalId({ amountRaw: "0", hash: null })).toBeUndefined();

    // Preflight poll, then the same confirmation poll against the target.
    expect(checkEvmBalanceForToken).toHaveBeenCalledTimes(2);
    expect(checkEvmBalanceForToken.mock.calls[0][0]).toMatchObject({
      amountDesiredRaw: "1",
      chain: Networks.Base,
      intervalMs: 1000,
      ownerAddress: EPHEMERAL,
      timeoutMs: 5000
    });
    expect(checkEvmBalanceForToken.mock.calls[1][0]).toMatchObject({
      amountDesiredRaw: "100000000",
      chain: Networks.Base,
      intervalMs: 1000,
      ownerAddress: EPHEMERAL,
      timeoutMs: 5000
    });

    const data = encodeFunctionData({ abi: erc20Abi, args: [EPHEMERAL, 5000000n], functionName: "transfer" });
    const gasEstimateArgs = {
      account: fundingAccount,
      data,
      maxFeePerGas: 10n,
      maxPriorityFeePerGas: 1n,
      to: usdcAddress,
      value: 0n
    };
    expect(estimateGas).toHaveBeenCalledTimes(2);
    expect(estimateGas.mock.calls[0][0]).toEqual(gasEstimateArgs);
    expect(estimateGas.mock.calls[1][0]).toEqual(gasEstimateArgs);
    expect(getTransactionCount).toHaveBeenCalledWith({ address: fundingAccount.address, blockTag: "pending" });
    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(sendTransaction.mock.calls[0]).toEqual([
      Networks.Base,
      fundingAccount,
      { data, gas: 21000n, maxFeePerGas: 10n, maxPriorityFeePerGas: 1n, nonce: 7, to: usdcAddress, value: 0n }
    ]);
    expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: TX_HASH });
    expect(executor.createSubsidy).toHaveBeenCalledTimes(1);
    expect(executor.createSubsidy).toHaveBeenCalledWith(expect.anything(), 5, EvmToken.USDC, fundingAccount.address, TX_HASH);
  });

  it("values the quote output on the quote's own network", async () => {
    balances("95000000");
    const executor = arrange(testCase, testCase.baseMetadata);
    findQuote.mockResolvedValue({
      metadata: testCase.baseMetadata,
      network: Networks.Robinhood,
      outputAmount: "100",
      outputCurrency: EvmToken.NVDA
    });

    await executor.executePhase(makeState(testCase));

    expect(priceFeedService.convertCurrency).toHaveBeenCalledWith("100", EvmToken.NVDA, EvmToken.USDC, null, Networks.Robinhood);
  });

  it("skips the transfer and the subsidy record when the destination already holds the target", async () => {
    balances("100000000");
    const executor = arrange(testCase, testCase.baseMetadata);

    await executor.executePhase(makeState(testCase));

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(estimateGas).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
    expect(checkEvmBalanceForToken).toHaveBeenCalledTimes(2);
  });

  it("rejects a corrupted state without an EVM ephemeral before any funding work", async () => {
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase, {}))).rejects.toMatchObject({
      message: `${executorName}: State metadata corrupted. This is a bug.`
    });

    expect(runSerializedEvmFundingOperation).not.toHaveBeenCalled();
  });

  it("treats a zero ephemeral balance as input not yet arrived", async () => {
    checkEvmBalanceForToken.mockImplementationOnce(async () => new Big(0));
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Failed to subsidize ${testCase.stateLabel} on EVM.`
    });

    expect((operationFailures[0] as Error).message).toBe("Invalid phase: input token did not arrive yet on EVM");
    expect(loggerError).toHaveBeenCalledWith(`Error in ${testCase.phaseName} (EVM):`, operationFailures[0]);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("pauses without sending when the funding wallet token balance is too low", async () => {
    balances("95000000");
    getFundingBalance.mockResolvedValue(new Big("10"));
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Funding wallet token balance 10 is below required subsidy 5000000.`
    });

    expect(loggerError).toHaveBeenCalledWith("EVM_FUNDING_TOKEN_BALANCE_LOW", {
      availableRaw: "10",
      network: Networks.Base,
      phase: testCase.phaseName,
      rampId: "ramp-1",
      requiredRaw: "5000000",
      token: usdcAddress
    });
    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("pauses without sending when the funding wallet has no native gas token", async () => {
    balances("95000000");
    getNativeFundingBalance.mockResolvedValue(new Big(0));
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Funding wallet has no native token for gas.`
    });

    expect(estimateGas).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("pauses without sending when the funding wallet native balance cannot cover the maximum gas cost", async () => {
    balances("95000000");
    getNativeFundingBalance.mockResolvedValue(new Big("215000"));
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Funding wallet native balance 215000 is below maximum gas cost 220000.`
    });

    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("fails the preflight when no gas price can be estimated", async () => {
    balances("95000000");
    estimateFeesPerGas.mockResolvedValue({});
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Failed to subsidize ${testCase.stateLabel} on EVM.`
    });

    expect((operationFailures[0] as Error).message).toBe(`${executorName}: Could not estimate the funding wallet gas price`);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("retries when the destination balance dropped between the two preflight reads", async () => {
    checkBalance.mockResolvedValue(new Big("99000000"));
    getDestinationBalance.mockResolvedValue(new Big("90000000"));
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Destination balance decreased during preflight; retrying subsidy calculation.`
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("shrinks the transfer when more funds arrive between the two preflight reads", async () => {
    checkBalance.mockResolvedValue(new Big("100000000"));
    checkBalance.mockResolvedValueOnce(new Big("95000000"));
    getDestinationBalance.mockResolvedValue(new Big("98000000"));
    const executor = arrange(testCase, testCase.baseMetadata);

    await executor.executePhase(makeState(testCase));

    const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
    expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(2000000n);
    expect(executor.createSubsidy).toHaveBeenCalledWith(expect.anything(), 2, EvmToken.USDC, fundingAccount.address, TX_HASH);
  });

  it("refuses a shortfall beyond the subsidy cap before any funding read", async () => {
    const { balanceRaw, message, metadata, quoteOutput } = testCase.capBreach;
    checkBalance.mockResolvedValue(new Big(balanceRaw));
    const executor = arrange(testCase, metadata, quoteOutput);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({ isRecoverable: true, message });

    expect(getFundingBalance).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("aborts a top-up whose pre-broadcast gas estimate proves a deterministic revert", async () => {
    balances("95000000");
    estimateGas.mockResolvedValueOnce(21000n);
    estimateGas.mockRejectedValueOnce(
      new EstimateGasExecutionError(new ExecutionRevertedError({ message: "transfer amount exceeds balance" }), {})
    );
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({ isRecoverable: true });

    expect(operationFailures[0]).toBeInstanceOf(financialOperationReal.FinancialOperationRejectedError);
    expect((operationFailures[0] as Error).message).toBe(
      `${executorName}: Funding transfer was rejected during pre-broadcast gas estimation`
    );
    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("rethrows a non-deterministic pre-broadcast gas estimate failure unchanged", async () => {
    balances("95000000");
    const rpcError = new Error("rpc unavailable");
    estimateGas.mockResolvedValueOnce(21000n);
    estimateGas.mockRejectedValueOnce(rpcError);
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({ isRecoverable: true });

    expect(operationFailures[0]).toBe(rpcError);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("fails the operation when the top-up transaction reverts on chain", async () => {
    balances("95000000");
    waitForTransactionReceipt.mockResolvedValue({ status: "reverted" });
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Failed to subsidize ${testCase.stateLabel} on EVM.`
    });

    expect((operationFailures[0] as Error).message).toBe(`${executorName}: Subsidy transaction ${TX_HASH} failed`);
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("records the subsidy but pauses when the destination never reaches the target afterwards", async () => {
    balances("95000000", "95000000");
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Confirmed subsidy operation did not leave the destination at its target balance.`
    });

    expect(executor.createSubsidy).toHaveBeenCalledWith(expect.anything(), 5, EvmToken.USDC, fundingAccount.address, TX_HASH);
  });

  it("wraps an unexpected confirmation poll failure as a generic recoverable error", async () => {
    balances("95000000");
    const rpcError = new Error("rpc unavailable");
    checkEvmBalanceForToken.mockImplementationOnce(async () => new Big("95000000"));
    checkEvmBalanceForToken.mockImplementationOnce(async () => {
      throw rpcError;
    });
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Failed to subsidize ${testCase.stateLabel} on EVM.`
    });

    expect(loggerError).toHaveBeenCalledWith(`Error in ${testCase.phaseName} (EVM):`, rpcError);
  });

  it("waits for settlement before taking the shared funding slot", async () => {
    balances("95000000");
    const startedAt = Date.now();
    let slotRequestedAfterMs: number | undefined;
    beforeSerializedFundingOperation = () => {
      slotRequestedAfterMs = Date.now() - startedAt;
    };
    const executor = arrange(testCase, testCase.baseMetadata);

    await executor.executePhase(makeState(testCase));

    // SUBSIDY_SETTLEMENT_DELAY_MS is 25 ms in tests.
    expect(slotRequestedAfterMs).toBeGreaterThanOrEqual(20);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("does not broadcast when the phase is aborted while waiting for the funding slot", async () => {
    balances("95000000");
    const controller = new AbortController();
    beforeSerializedFundingOperation = () => {
      controller.abort(new Error("phase timed out"));
    };
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase), controller.signal)).rejects.toMatchObject({ isRecoverable: true });

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("repairs the subsidy record from a legacy confirmed hash without sending", async () => {
    balances("100000000");
    legacyOperationResponse = { hash: TX_HASH };
    getTransaction.mockResolvedValue({
      from: fundingAccount.address,
      input: encodeFunctionData({ abi: erc20Abi, args: [EPHEMERAL, 5000000n], functionName: "transfer" }),
      to: usdcAddress
    });
    const executor = arrange(testCase, testCase.baseMetadata);

    await executor.executePhase(makeState(testCase));

    expect(getTransaction).toHaveBeenCalledWith({ hash: TX_HASH });
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).toHaveBeenCalledWith(expect.anything(), 5, EvmToken.USDC, fundingAccount.address, TX_HASH);
  });

  it("only reconciles a legacy transfer that stays within the target balance", async () => {
    balances("100000000");
    legacyOperationResponse = { hash: TX_HASH };
    getTransaction.mockResolvedValue({
      from: fundingAccount.address,
      input: encodeFunctionData({ abi: erc20Abi, args: [EPHEMERAL, 100000001n], functionName: "transfer" }),
      to: usdcAddress
    });
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({ isRecoverable: true });

    expect(executor.createSubsidy).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["positive transfer", { amountRaw: "5000000", hash: TX_HASH }, "50000000"],
    ["no-op", { amountRaw: "0", hash: null }, "95000000"]
  ])("does not advance an underfunded phase after replaying a confirmed %s", async (_kind, replay, balanceRaw) => {
    checkBalance.mockResolvedValue(new Big(balanceRaw));
    operationReplay = replay;
    const executor = arrange(testCase, testCase.baseMetadata);

    await expect(executor.executePhase(makeState(testCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: `${executorName}: Confirmed subsidy operation did not leave the destination at its target balance.`
    });

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(conversions).toEqual([]);
    if (replay.hash) {
      expect(executor.createSubsidy).toHaveBeenCalledWith(
        expect.anything(),
        5,
        EvmToken.USDC,
        fundingAccount.address,
        replay.hash
      );
    } else {
      expect(executor.createSubsidy).not.toHaveBeenCalled();
    }
  });
});

describe("SubsidizePreSwapExecutor EVM top-up specifics", () => {
  const preCase = cases[0];

  it("adds the fee reserve to the swap input target", async () => {
    // target 100_000_005: swap amount plus the reserve that keeps later fee transfers funded
    balances("100000000", "100000005");
    const executor = arrange(preCase, preMetadata({ feeReserveRaw: "5" }));

    await executor.executePhase(makeState(preCase));

    const operationArgs = runFinancialOperation.mock.calls[0][0] as Record<string, any>;
    expect(operationArgs.request.targetBalanceRaw).toBe("100000005");
    expect(checkEvmBalanceForToken.mock.calls[1][0]).toMatchObject({ amountDesiredRaw: "100000005" });
    const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
    expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(5n);
    expect(executor.createSubsidy).toHaveBeenCalledWith(
      expect.anything(),
      0.000005,
      EvmToken.USDC,
      fundingAccount.address,
      TX_HASH
    );
  });

  it("converts the subsidy before the quote output and floors the cap at $1", async () => {
    checkBalance.mockResolvedValue(new Big("98500000"));
    const executor = arrange(preCase, preMetadata(), "2");

    await expect(executor.executePhase(makeState(preCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: "SubsidizePreSwapExecutor: Required subsidy $1.5 exceeds cap $1.00 (max of $1.00 and 0.05 of quote output $2)."
    });

    expect(conversions).toEqual(["1.5", "2"]);
  });

  it("allows a shortfall exactly at the percentage cap", async () => {
    balances("95000000");
    const executor = arrange(preCase, preMetadata());

    await executor.executePhase(makeState(preCase));

    expect(conversions).toEqual(["5", "100"]);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  const depositOn = (fromNetwork: string) => ({
    blocks: { ...preMetadata().blocks, evmOfframpSource: { fromNetwork } }
  });
  // The deposit the user broadcast, with the blueprint fundEphemeral verified its reported hash against.
  const deposits = [
    {
      blueprints: [{ phase: "squidRouterNoPermitTransfer", signer: OTHER }],
      name: "a direct transfer",
      state: { evmEphemeralAddress: EPHEMERAL, squidRouterNoPermitTransferHash: DEPOSIT_HASH }
    },
    {
      blueprints: [{ phase: "squidRouterSwap", signer: OTHER }],
      name: "the user's Squid swap",
      state: { evmEphemeralAddress: EPHEMERAL, squidRouterSwapHash: DEPOSIT_HASH }
    }
  ];
  const [transfer, squidSwap] = deposits;
  const UNVERIFIED_HASH = "0x5555555555555555555555555555555555555555555555555555555555555555";

  describe.each(deposits)("after $name on the same network", deposit => {
    it("tops up a deposit that arrived short by exactly what it fell short", async () => {
      // 97 arrived and 2 went out as fees, so the 95 held are all the deposit left
      receipts.set(DEPOSIT_HASH, { logs: [usdcTransfer(OTHER, EPHEMERAL, 97_000_000n)], status: "success" });
      receipts.set(keccak256(FEE_TX), { logs: [usdcTransfer(EPHEMERAL, OTHER, 2_000_000n)], status: "success" });
      balances("95000000");
      const executor = arrange(preCase, depositOn(Networks.Base));

      await executor.executePhase(makeState(preCase, deposit.state, presignedTxs, deposit.blueprints));

      const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
      expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(5_000_000n);
    });

    it("pays nothing when the ephemeral holds less than its deposit left on it", async () => {
      receipts.set(DEPOSIT_HASH, { logs: [usdcTransfer(OTHER, EPHEMERAL, 102_000_000n)], status: "success" });
      receipts.set(keccak256(FEE_TX), { logs: [usdcTransfer(EPHEMERAL, OTHER, 2_000_000n)], status: "success" });
      balances("95000000");
      const executor = arrange(preCase, depositOn(Networks.Base));

      await expect(
        executor.executePhase(makeState(preCase, deposit.state, presignedTxs, deposit.blueprints))
      ).rejects.toMatchObject({
        message:
          "SubsidizePreSwapExecutor: The ephemeral holds 95000000, below the 100000000 the preceding step left on it, so a top-up would cover more than that step fell short by.",
        name: "ReconciliationRequiredPhaseError"
      });

      expect(sendTransaction).not.toHaveBeenCalled();
      expect(executor.createSubsidy).not.toHaveBeenCalled();
    });
  });

  it.each([
    ["the swap hash on a ramp whose deposit blueprint is the Squid swap", squidSwap.blueprints, "squidRouterNoPermitTransferHash"],
    ["the transfer hash on a ramp whose deposit blueprint is the transfer", transfer.blueprints, "squidRouterSwapHash"]
  ] as const)("measures against %s when both hashes are reported", async (_label, blueprints, otherField) => {
    receipts.set(DEPOSIT_HASH, { logs: [usdcTransfer(OTHER, EPHEMERAL, 100_000_000n)], status: "success" });
    balances("95000000");
    const executor = arrange(preCase, depositOn(Networks.Base));
    const state = {
      evmEphemeralAddress: EPHEMERAL,
      squidRouterNoPermitTransferHash: DEPOSIT_HASH,
      squidRouterSwapHash: DEPOSIT_HASH,
      [otherField]: UNVERIFIED_HASH
    };

    await expect(executor.executePhase(makeState(preCase, state, presignedTxs, [...blueprints]))).rejects.toMatchObject({
      name: "ReconciliationRequiredPhaseError"
    });

    expect(getTransactionReceipt).toHaveBeenCalledWith({ hash: DEPOSIT_HASH });
    expect(getTransactionReceipt).not.toHaveBeenCalledWith({ hash: UNVERIFIED_HASH });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    ["no deposit blueprint", []],
    ["only a Squid swap the ephemeral signs", [{ phase: "squidRouterSwap", signer: EPHEMERAL }]]
  ])("reads no reported hash on a ramp with %s", async (_label, blueprints) => {
    balances("95000000");
    const executor = arrange(preCase, depositOn(Networks.Base));
    const state = { ...transfer.state, squidRouterSwapHash: UNVERIFIED_HASH };

    await executor.executePhase(makeState(preCase, state, presignedTxs, blueprints));

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("leaves a fee transfer presigned for another network out of the measure", async () => {
    // Were the other network's transfer counted, the deposit would account for 98 and the 99 held would pass.
    receipts.set(DEPOSIT_HASH, { logs: [usdcTransfer(OTHER, EPHEMERAL, 100_000_000n)], status: "success" });
    receipts.set(keccak256(FEE_TX), { logs: [usdcTransfer(EPHEMERAL, OTHER, 2_000_000n)], status: "success" });
    balances("99000000");
    const executor = arrange(preCase, depositOn(Networks.Base));
    const presigned = [{ network: Networks.Polygon, phase: "distributeFees", txData: FEE_TX }];

    await expect(
      executor.executePhase(makeState(preCase, transfer.state, presigned, transfer.blueprints))
    ).rejects.toMatchObject({ name: "ReconciliationRequiredPhaseError" });

    expect(getTransactionReceipt).not.toHaveBeenCalledWith({ hash: keccak256(FEE_TX) });
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("tops up a deposit bridged from another network within the cap", async () => {
    balances("95000000");
    const executor = arrange(preCase, depositOn(Networks.Arbitrum));

    await executor.executePhase(makeState(preCase, squidSwap.state, presignedTxs, squidSwap.blueprints));

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  // A mint that delivered `mintedRaw`, as each provider's phase records it.
  const mints = [
    {
      arrange: (mintedRaw: string) =>
        arrange(preCase, { blocks: { ...preMetadata().blocks, alfredpayMint: { outputAmountRaw: mintedRaw } } }),
      name: "an Alfredpay mint"
    },
    {
      arrange: (mintedRaw: string) => {
        findMintTicket.mockResolvedValue({ response: { expectedAmountReceived: mintedRaw } });
        return arrange(preCase, {
          blocks: { ...preMetadata().blocks, aveniaMint: { transfer: { outputAmountRaw: "100000000" } } }
        });
      },
      name: "an Avenia mint"
    }
  ];

  describe.each(mints)("after $name", mint => {
    it("tops up a mint below the target by exactly the difference", async () => {
      balances("95000000");
      const executor = mint.arrange("95000000");

      await executor.executePhase(makeState(preCase));

      const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
      expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(5_000_000n);
      expect(getTransactionReceipt).not.toHaveBeenCalled();
    });

    it("pays nothing when the ephemeral holds less than the mint delivered", async () => {
      balances("95000000");
      const executor = mint.arrange("99000000");

      await expect(executor.executePhase(makeState(preCase))).rejects.toMatchObject({
        message:
          "SubsidizePreSwapExecutor: The ephemeral holds 95000000, below the 99000000 the preceding step left on it, so a top-up would cover more than that step fell short by.",
        name: "ReconciliationRequiredPhaseError"
      });

      expect(sendTransaction).not.toHaveBeenCalled();
      expect(executor.createSubsidy).not.toHaveBeenCalled();
    });
  });

  it("reads the mint ticket of the ramp", async () => {
    balances("95000000");
    const executor = mints[1].arrange("95000000");

    await executor.executePhase(makeState(preCase));

    expect(findMintTicket).toHaveBeenCalledWith({
      where: {
        attemptClass: "provider-mint-ticket",
        phase: "brlaOnrampMint",
        provider: "avenia",
        scopeId: "ramp-1",
        scopeType: "ramp",
        status: ["submitted", "unknown", "confirmed"]
      }
    });
  });

  // The mint phase lets such a ramp pass once the ephemeral holds 95% of the quoted transfer, here 95 of 100.
  describe("after an Avenia mint whose ticket outcome was not recorded", () => {
    const arrangeUnrecorded = () => {
      const executor = mints[1].arrange("0");
      findMintTicket.mockResolvedValue({ response: null });
      return executor;
    };

    it("tops up from the amount the mint phase accepted", async () => {
      balances("95000000");
      const executor = arrangeUnrecorded();

      await executor.executePhase(makeState(preCase));

      const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
      expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(5_000_000n);
    });

    it("pays nothing when the ephemeral holds less than the mint phase accepted", async () => {
      balances("94999999");
      const executor = arrangeUnrecorded();

      await expect(executor.executePhase(makeState(preCase))).rejects.toMatchObject({
        message:
          "SubsidizePreSwapExecutor: The ephemeral holds 94999999, below the 95000000 the preceding step left on it, so a top-up would cover more than that step fell short by.",
        name: "ReconciliationRequiredPhaseError"
      });

      expect(sendTransaction).not.toHaveBeenCalled();
    });
  });

  it("pauses a top-up after a mint whose delivered amount is not recorded", async () => {
    balances("95000000");
    const executor = mints[1].arrange("95000000");
    findMintTicket.mockResolvedValue(null);

    await expect(executor.executePhase(makeState(preCase))).rejects.toMatchObject({
      message: "SubsidizePreSwapExecutor: No recorded mint amount to measure the top-up against.",
      name: "ReconciliationRequiredPhaseError"
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("needs no recorded mint amount when the ephemeral already holds the target", async () => {
    balances("100000000");
    const executor = mints[1].arrange("95000000");
    findMintTicket.mockResolvedValue(null);

    await executor.executePhase(makeState(preCase));

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("tops up within the cap where the preceding step records neither a transaction nor an amount", async () => {
    balances("95000000");
    const executor = arrange(preCase, preMetadata());

    await executor.executePhase(makeState(preCase));

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("SubsidizePostSwapExecutor EVM top-up specifics", () => {
  const postCase = cases[1];

  it("converts the quote output, then the discrepancy, then the discount portion", async () => {
    // quoted actual 98, current 95, expected 100 -> discrepancy 3, discount 2
    balances("95000000");
    const executor = arrange(
      postCase,
      postMetadata({ actualOutputAmountRaw: "98000000", subsidyAmountInOutputTokenRaw: "2000000" })
    );

    await executor.executePhase(makeState(postCase));

    expect(conversions).toEqual(["100", "3", "2"]);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("refuses a discount of at least $1 above its own cap", async () => {
    checkBalance.mockResolvedValue(new Big("10000000"));
    const executor = arrange(
      postCase,
      postMetadata({
        actualOutputAmountRaw: "10000000",
        subsidyAmountInOutputTokenRaw: "1000000",
        targetOutputAmountRaw: "11000000"
      }),
      "10"
    );

    await expect(executor.executePhase(makeState(postCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: "SubsidizePostSwapExecutor: Required discount subsidy $1 exceeds cap $0.50 (0.05 of quote output $10)."
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("tops up a swap that filled short by exactly what it fell short", async () => {
    // the swap paid 97 and 2 went out as fees, so the 95 held are all the swap left
    receipts.set(keccak256(SWAP_TX), { logs: [usdcTransfer(OTHER, EPHEMERAL, 97_000_000n)], status: "success" });
    receipts.set(keccak256(FEE_TX), { logs: [usdcTransfer(EPHEMERAL, OTHER, 2_000_000n)], status: "success" });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await executor.executePhase(makeState(postCase));

    const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
    expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(5_000_000n);
  });

  it("pays nothing when the ephemeral holds less than its swap left on it", async () => {
    receipts.set(keccak256(SWAP_TX), { logs: [usdcTransfer(OTHER, EPHEMERAL, 100_000_000n)], status: "success" });
    receipts.set(keccak256(FEE_TX), { logs: [usdcTransfer(EPHEMERAL, OTHER, 2_000_000n)], status: "success" });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await expect(executor.executePhase(makeState(postCase))).rejects.toMatchObject({
      message:
        "SubsidizePostSwapExecutor: The ephemeral holds 95000000, below the 98000000 the preceding step left on it, so a top-up would cover more than that step fell short by.",
      name: "ReconciliationRequiredPhaseError"
    });

    expect(conversions).toEqual([]);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("ignores transfers of other tokens and between other accounts in the measured receipts", async () => {
    receipts.set(keccak256(SWAP_TX), {
      logs: [
        usdcTransfer(OTHER, EPHEMERAL, 95_000_000n),
        usdcTransfer(OTHER, fundingAccount.address, 50_000_000n),
        { ...usdcTransfer(OTHER, EPHEMERAL, 50_000_000n), address: OTHER }
      ],
      status: "success"
    });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await executor.executePhase(makeState(postCase));

    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("measures the Uniswap swap on a route without a Nabla swap", async () => {
    const uniswapSwap = [{ network: Networks.Base, phase: "uniswapSwap", txData: SWAP_TX }];
    receipts.set(keccak256(SWAP_TX), { logs: [usdcTransfer(OTHER, EPHEMERAL, 100_000_000n)], status: "success" });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await expect(
      executor.executePhase(makeState(postCase, { evmEphemeralAddress: EPHEMERAL }, uniswapSwap))
    ).rejects.toMatchObject({ name: "ReconciliationRequiredPhaseError" });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  describe("a fixed swap that was mined without the API sending it", () => {
    const marked = { blockState: { uniswapV3FixedSwap: { swapSentOutsideApi: true } }, evmEphemeralAddress: EPHEMERAL };
    const uniswapSwap = [{ network: Networks.Base, phase: "uniswapSwap", txData: SWAP_TX }];
    // The swap filled 2 short, and the ephemeral holds all of it.
    const shortFill = () => {
      receipts.set(keccak256(SWAP_TX), { logs: [usdcTransfer(OTHER, EPHEMERAL, 93_000_000n)], status: "success" });
      balances("93000000");
    };

    it("is not topped up, though its receipt shows the shortfall", async () => {
      shortFill();
      const executor = arrange(postCase, postMetadata());

      await expect(executor.executePhase(makeState(postCase, marked, uniswapSwap))).rejects.toMatchObject({
        message: "SubsidizePostSwapExecutor: The swap was not broadcast by the API, so its shortfall is not topped up.",
        name: "ReconciliationRequiredPhaseError"
      });

      expect(sendTransaction).not.toHaveBeenCalled();
      expect(executor.createSubsidy).not.toHaveBeenCalled();
    });

    it("is topped up by its shortfall when the API sent it", async () => {
      shortFill();
      const executor = arrange(postCase, postMetadata());

      await executor.executePhase(makeState(postCase, { evmEphemeralAddress: EPHEMERAL }, uniswapSwap));

      const transaction = sendTransaction.mock.calls[0][2] as { data: `0x${string}` };
      expect(decodeFunctionData({ abi: erc20Abi, data: transaction.data }).args?.[1]).toBe(7_000_000n);
    });

    it("passes without a top-up once the ephemeral holds the target", async () => {
      balances("100000000");
      const executor = arrange(postCase, postMetadata());

      await executor.executePhase(makeState(postCase, marked, uniswapSwap));

      expect(sendTransaction).not.toHaveBeenCalled();
    });

    it("does not hold back the top-up of a Nabla swap on the same ramp", async () => {
      receipts.set(keccak256(SWAP_TX), { logs: [usdcTransfer(OTHER, EPHEMERAL, 95_000_000n)], status: "success" });
      balances("95000000");
      const executor = arrange(postCase, postMetadata());
      const stockSaleMarked = { blockState: { stockRoute: { swapSentOutsideApi: true } }, evmEphemeralAddress: EPHEMERAL };

      await executor.executePhase(makeState(postCase, stockSaleMarked));

      expect(sendTransaction).toHaveBeenCalledTimes(1);
    });
  });

  it("retries without sending while a measured transaction has no successful receipt", async () => {
    receipts.set(keccak256(SWAP_TX), { logs: [], status: "reverted" });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await expect(executor.executePhase(makeState(postCase))).rejects.toMatchObject({
      message: "SubsidizePostSwapExecutor: A transaction the top-up is measured against has no successful receipt yet.",
      name: "RecoverablePhaseError"
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("retries without sending while the node does not have a measured receipt yet", async () => {
    getTransactionReceipt.mockImplementationOnce(async () => {
      throw Object.assign(new Error("not found"), { name: "TransactionReceiptNotFoundError" });
    });
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await expect(executor.executePhase(makeState(postCase))).rejects.toMatchObject({
      message: "SubsidizePostSwapExecutor: A transaction the top-up is measured against has no successful receipt yet.",
      name: "RecoverablePhaseError"
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("pauses a top-up that has no presigned swap to be measured against", async () => {
    balances("95000000");
    const executor = arrange(postCase, postMetadata());

    await expect(executor.executePhase(makeState(postCase, { evmEphemeralAddress: EPHEMERAL }, []))).rejects.toMatchObject({
      message: "SubsidizePostSwapExecutor: No presigned swap to measure the top-up against.",
      name: "ReconciliationRequiredPhaseError"
    });

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("needs no receipt when the ephemeral already holds the target", async () => {
    balances("100000000");
    const executor = arrange(postCase, postMetadata());

    await executor.executePhase(makeState(postCase, { evmEphemeralAddress: EPHEMERAL }, []));

    expect(getTransactionReceipt).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("defaults the output network to Base", async () => {
    balances("95000000");
    const executor = arrange(postCase, postMetadata());
    await executor.executePhase(makeState(postCase));
    expect((runFinancialOperation.mock.calls[0][0] as Record<string, any>).provider).toBe(Networks.Base);
  });

  it("rejects a non-EVM output network before any funding work", async () => {
    const executor = arrange(postCase, postMetadata({ network: Networks.AssetHub }));

    await expect(executor.executePhase(makeState(postCase))).rejects.toMatchObject({
      isRecoverable: true,
      message: "SubsidizePostSwapExecutor: Failed to subsidize post swap on EVM."
    });

    expect(loggerError).toHaveBeenCalledWith(
      "Error in subsidizePostSwap (EVM):",
      expect.objectContaining({ message: "SubsidizePostSwapExecutor: Unsupported EVM network assethub" })
    );
    expect(runSerializedEvmFundingOperation).not.toHaveBeenCalled();
  });
});
