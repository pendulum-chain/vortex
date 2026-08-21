import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import {
  AlfredpayOnrampStatus,
  type EvmTokenDetails,
  EvmToken,
  FiatToken,
  Networks,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, encodeFunctionData, erc20Abi, EstimateGasExecutionError, ExecutionRevertedError } from "viem";
import { config } from "../../../../../config/vars";
import type RampState from "../../../../../models/rampState.model";
import * as quoteTicketNamespace from "../../../../../models/quoteTicket.model";
import * as evmFundingNamespace from "../core/evm-funding";
import * as financialOperationNamespace from "../core/financial-operation";
import { priceFeedService } from "../../../priceFeed.service";

const sharedReal = { ...sharedNamespace };
const quoteTicketReal = { ...quoteTicketNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const financialOperationReal = { ...financialOperationNamespace };
const financialOperationOutcomes = new Map<
  string,
  { response?: unknown; status: "confirmed" | "unknown" }
>();
const findQuote = mock(async () => undefined as unknown);
const checkBalance = mock(async () => new Big(0));
const checkEvmBalanceForToken = mock(async ({ amountDesiredRaw }: { amountDesiredRaw: string }) => {
  const balance = await checkBalance();
  if (balance.lt(amountDesiredRaw)) {
    throw new sharedReal.BalanceCheckError(
      sharedReal.BalanceCheckErrorType.Timeout,
      "Balance did not meet the limit within 5000ms"
    );
  }
  return balance;
});
const getFundingBalance = mock(async () => new Big("1000000000"));
const getRoute = mock(async (request: { fromAmount: string }) => ({
  data: {
    route: {
      estimate: {
        toAmount: new Big(request.fromAmount).div("1000000000000").toFixed(0),
        toAmountMin: new Big(request.fromAmount).div("1000000000000").toFixed(0)
      },
      transactionRequest: {
        data: "0x",
        gasLimit: "100000",
        target: "0x3333333333333333333333333333333333333333",
        value: request.fromAmount
      }
    }
  }
}));
const getDestinationBalance = mock(async () => checkBalance());
const getNativeFundingBalance = mock(async () => new Big("1000000000"));
const getEphemeralNativeBalance = mock(async () => 0n);
const estimateFeesPerGas = mock(async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n }));
const isDeterministicPreBroadcastRevert = mock((error: unknown) =>
  sharedReal.isDeterministicPreBroadcastRevert(error)
);
const getOnrampTransaction = mock(
  async (): Promise<{ metadata?: { txHash?: string }; status: AlfredpayOnrampStatus }> => ({
    status: AlfredpayOnrampStatus.CREATED
  })
);
const sendTransaction = mock(
  async (
    _network?: unknown,
    _account?: unknown,
    _transaction?: { data?: `0x${string}`; gas?: bigint; nonce?: number; value?: bigint }
  ) => "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`
);
const estimateGas = mock(async () => 21000n);
const getTransaction = mock(async (): Promise<{ from: `0x${string}`; input: `0x${string}`; to: `0x${string}` }> => {
  throw new Error("Unexpected transaction lookup");
});
const getTransactionCount = mock(async () => 0);
const waitForTransactionReceipt = mock(async () => ({ status: "success" as const }));
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };
const destinationGasQuote = {
  executionFeeUsd: "0.01",
  fundingGasLimit: "21000",
  isNativeTransfer: true,
  maximumFeePerGas: "100",
  network: Networks.Polygon,
  programVersion: 2,
  transferGasLimit: "21000"
} as const;
const financialOperationFailures: unknown[] = [];
let financialOperationReplay: unknown;
let legacyFinancialOperationResponse: unknown;
let beforeSerializedFundingOperation: (() => Promise<void> | void) | undefined;
const runSerializedEvmFundingOperation = mock(async (_network: unknown, operation: () => Promise<unknown>) => {
  await beforeSerializedFundingOperation?.();
  return operation();
});
const runFinancialOperation = mock(
  async ({
    attemptClass,
    beforePerform,
    perform,
    reconcile,
    signal
  }: {
    attemptClass: string;
    beforePerform?(): Promise<void>;
    perform(key: string): Promise<unknown>;
    reconcile?(operation: { response: unknown }): Promise<unknown | null>;
    request: Record<string, unknown>;
    retryFailed?: boolean;
    signal?: AbortSignal;
  }) => {
    if (signal?.aborted) throw signal.reason;
    if (financialOperationReplay !== undefined) return financialOperationReplay;
    const existing = financialOperationOutcomes.get(attemptClass);
    if (existing?.status === "confirmed") return existing.response;
    if (existing?.status === "unknown") {
      throw Object.assign(new Error("financial operation requires reconciliation"), {
        requiresManualReconciliation: true
      });
    }
    if (legacyFinancialOperationResponse !== undefined) {
      const reconciled = await reconcile?.({ response: legacyFinancialOperationResponse });
      if (reconciled === null || reconciled === undefined) throw new Error("Legacy operation requires reconciliation");
      return reconciled;
    }
    await beforePerform?.();
    try {
      const response = await perform(`test-operation:${attemptClass}`);
      financialOperationOutcomes.set(attemptClass, { response, status: "confirmed" });
      return response;
    } catch (error) {
      financialOperationFailures.push(error);
      financialOperationOutcomes.set(attemptClass, { status: "unknown" });
      throw error;
    }
  }
);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  AlfredpayApiService: { getInstance: () => ({ getOnrampTransaction }) },
  // Faithful to the real poller: resolves only at or above the desired amount and
  // throws a Timeout BalanceCheckError otherwise — it never returns a low balance.
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        chain: { nativeCurrency: { decimals: 18 } },
        estimateFeesPerGas,
        estimateGas,
        getBalance: getEphemeralNativeBalance,
        getTransaction,
        getTransactionCount,
        readContract: async () => 10000n,
        waitForTransactionReceipt
      }),
      getWalletClient: () => ({ sendTransaction }),
      sendTransactionWithBlindRetry: sendTransaction
    })
  },
  getEvmBalance: ({ ownerAddress }: { ownerAddress: string }) =>
    ownerAddress.toLowerCase() === fundingAccount.address.toLowerCase()
      ? getFundingBalance()
      : getDestinationBalance(),
  getEvmNativeBalance: getNativeFundingBalance,
  getRoute,
  isDeterministicPreBroadcastRevert
}));
mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuote }
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
const { FinalSettlementSubsidyExecutor } = await import("../phases/final-settlement-subsidy/execution");
const { AlfredpayOnrampMintExecutor } = await import("../phases/alfredpay-mint/execution");
const { FundEphemeralExecutor } = await import("../phases/fund-ephemeral/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

beforeEach(() => {
  findQuote.mockClear();
  financialOperationOutcomes.clear();
  checkBalance.mockClear();
  checkBalance.mockResolvedValue(new Big(0));
  checkEvmBalanceForToken.mockClear();
  getFundingBalance.mockClear();
  getFundingBalance.mockResolvedValue(new Big("1000000000"));
  getRoute.mockClear();
  getRoute.mockImplementation(async (request: { fromAmount: string }) => ({
    data: {
      route: {
        estimate: {
          toAmount: new Big(request.fromAmount).div("1000000000000").toFixed(0),
          toAmountMin: new Big(request.fromAmount).div("1000000000000").toFixed(0)
        },
        transactionRequest: {
          data: "0x",
          gasLimit: "100000",
          target: "0x3333333333333333333333333333333333333333",
          value: request.fromAmount
        }
      }
    }
  }));
  getDestinationBalance.mockClear();
  getDestinationBalance.mockImplementation(async () => checkBalance());
  getNativeFundingBalance.mockClear();
  getNativeFundingBalance.mockResolvedValue(new Big("1000000000"));
  getEphemeralNativeBalance.mockClear();
  getEphemeralNativeBalance.mockResolvedValue(0n);
  estimateFeesPerGas.mockClear();
  estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n });
  isDeterministicPreBroadcastRevert.mockClear();
  getOnrampTransaction.mockClear();
  sendTransaction.mockClear();
  estimateGas.mockClear();
  getTransaction.mockClear();
  getTransactionCount.mockClear();
  runSerializedEvmFundingOperation.mockClear();
  beforeSerializedFundingOperation = undefined;
  runFinancialOperation.mockClear();
  financialOperationReplay = undefined;
  legacyFinancialOperationResponse = undefined;
  financialOperationFailures.length = 0;
  waitForTransactionReceipt.mockClear();
});

describe("EVM block executor regressions", () => {
  it.each([
    {
      createExecutor: () => Object.create(SubsidizePreSwapExecutor.prototype) as any,
      direction: RampDirection.SELL,
      metadata: {
        blocks: {
          subsidizePreSwap: {
            expectedOutputAmountDecimal: "100",
            expectedOutputAmountRaw: "100000000",
            inputCurrency: EvmToken.USDC,
            inputDecimals: 6,
            network: Networks.Base,
            targetInputAmountRaw: "100000000"
          }
        }
      },
      phase: "pre-swap"
    },
    {
      createExecutor: () => Object.create(SubsidizePostSwapExecutor.prototype) as any,
      direction: RampDirection.BUY,
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      phase: "post-swap"
    }
  ])("refreshes $phase subsidy balances after acquiring the funding slot", async testCase => {
    checkBalance.mockResolvedValue(new Big("95000000"));
    beforeSerializedFundingOperation = () => {
      checkBalance.mockResolvedValue(new Big("100000000"));
    };
    findQuote.mockResolvedValue({
      metadata: testCase.metadata,
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = testCase.createExecutor();
    executor.createSubsidy = mock(async () => undefined);

    try {
      await executor.executePhase({
        quoteId: "quote-1",
        state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
        type: testCase.direction
      } as RampState);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(runSerializedEvmFundingOperation).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("does not broadcast a post-swap subsidy aborted while waiting for the funding slot", async () => {
    checkBalance.mockResolvedValue(new Big("95000000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    let enterFundingSlot!: () => void;
    const fundingSlotEntered = new Promise<void>(resolve => {
      enterFundingSlot = resolve;
    });
    let releaseFundingSlot!: () => void;
    const fundingSlotRelease = new Promise<void>(resolve => {
      releaseFundingSlot = resolve;
    });
    beforeSerializedFundingOperation = async () => {
      enterFundingSlot();
      await fundingSlotRelease;
    };
    const controller = new AbortController();
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);
    const execution = executor.executePhase(
      {
        quoteId: "quote-1",
        state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
        type: RampDirection.BUY
      } as RampState,
      controller.signal
    );

    await fundingSlotEntered;
    controller.abort(new Error("phase timed out"));
    releaseFundingSlot();

    await expect(execution).rejects.toMatchObject({ isRecoverable: true });
    expect(checkBalance).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it.each([
    {
      fund: (executor: any, state: RampState) =>
        executor.fundEvmEphemeralAccount(state, Networks.Polygon, 1000n, destinationGasQuote),
      path: "source"
    },
    {
      fund: (executor: any, state: RampState) =>
        executor.fundDestinationEvmEphemeralAccount(state, Networks.Polygon, 1000n, destinationGasQuote),
      path: "destination"
    }
  ])("rechecks the $path ephemeral funding fee envelope after acquiring the slot", async ({ fund }) => {
    beforeSerializedFundingOperation = () => {
      estimateFeesPerGas.mockResolvedValue({ maxFeePerGas: 101n, maxPriorityFeePerGas: 1n });
    };
    const executor = Object.create(FundEphemeralExecutor.prototype) as any;
    const state = { state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" } } as RampState;

    await expect(fund(executor, state)).rejects.toMatchObject({ message: sharedReal.QuoteError.NetworkFeesTooHigh });

    expect(estimateFeesPerGas).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refreshes the native destination shortfall after acquiring the funding slot", async () => {
    beforeSerializedFundingOperation = () => {
      getEphemeralNativeBalance.mockResolvedValue(1000n);
    };
    const executor = Object.create(FundEphemeralExecutor.prototype) as any;
    const state = { state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" } } as RampState;

    await executor.fundDestinationEvmEphemeralAccount(state, Networks.Polygon, 1000n, destinationGasQuote);

    expect(getEphemeralNativeBalance).toHaveBeenCalled();
    expect(runFinancialOperation).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("leaves native funding unclaimed when cancellation happens while waiting for the funding slot", async () => {
    let enterFundingSlot!: () => void;
    const fundingSlotEntered = new Promise<void>(resolve => {
      enterFundingSlot = resolve;
    });
    let releaseFundingSlot!: () => void;
    const fundingSlotRelease = new Promise<void>(resolve => {
      releaseFundingSlot = resolve;
    });
    beforeSerializedFundingOperation = async () => {
      enterFundingSlot();
      await fundingSlotRelease;
    };
    const controller = new AbortController();
    const executor = Object.create(FundEphemeralExecutor.prototype) as any;
    const funding = executor.fundDestinationEvmEphemeralAccount(
      { state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" } } as RampState,
      Networks.Polygon,
      1000n,
      destinationGasQuote,
      controller.signal
    );

    await fundingSlotEntered;
    controller.abort(new Error("phase timed out"));
    releaseFundingSlot();

    await expect(funding).rejects.toThrow("phase timed out");
    expect(runFinancialOperation).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("splits BUY subsidy components and skips zero-value currency conversion", async () => {
    checkBalance.mockResolvedValue(new Big("100000000"));
    checkBalance.mockResolvedValueOnce(new Big("95000000"));
    getDestinationBalance.mockResolvedValue(new Big("95000000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const conversions: string[] = [];
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => {
      conversions.push(String(amount));
      return String(amount);
    }) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await executor.executePhase({
        quoteId: "quote-1",
        state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
        type: RampDirection.BUY
      } as RampState);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(conversions).toEqual(["100", "5"]);
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("allows a sub-$1 discount subsidy above the runtime percentage cap", async () => {
    checkBalance.mockResolvedValue(new Big("602931"));
    checkBalance.mockResolvedValueOnce(new Big("563600"));
    getDestinationBalance.mockResolvedValue(new Big("563600"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "563612",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "39319",
            targetOutputAmountRaw: "602931"
          }
        }
      },
      outputAmount: "0.602893",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await executor.executePhase({
        quoteId: "quote-1",
        state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
        type: RampDirection.BUY
      } as RampState);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(sendTransaction).toHaveBeenCalledTimes(1);
    expect(executor.createSubsidy).toHaveBeenCalledWith(
      expect.anything(),
      0.039331,
      EvmToken.USDC,
      fundingAccount.address,
      expect.any(String)
    );
  });

  it("retains the runtime percentage cap for discount subsidies of at least $1", async () => {
    checkBalance.mockResolvedValue(new Big("10000000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "10000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "1000000",
            targetOutputAmountRaw: "11000000"
          }
        }
      },
      outputAmount: "10",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    const originalDiscountCap = config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction;
    config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction = 0.05;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await expect(
        executor.executePhase({
          quoteId: "quote-1",
          state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
          type: RampDirection.BUY
        } as RampState)
      ).rejects.toMatchObject({ isRecoverable: true });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
      config.subsidy.evmPostSwapDiscountSubsidyQuoteFraction = originalDiscountCap;
    }

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("leaves pre-swap subsidy unclaimed when the funding wallet token balance is insufficient", async () => {
    checkBalance.mockResolvedValue(new Big("99000000"));
    getFundingBalance.mockResolvedValue(new Big("10"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePreSwap: {
            expectedOutputAmountDecimal: "100",
            expectedOutputAmountRaw: "100000000",
            inputCurrency: EvmToken.USDC,
            inputDecimals: 6,
            network: Networks.Base,
            targetInputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePreSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await expect(
        executor.executePhase({
          quoteId: "quote-1",
          state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
          type: RampDirection.SELL
        } as RampState)
      ).rejects.toMatchObject({ isRecoverable: true, message: expect.stringContaining("Funding wallet token balance") });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("uses a stable target authorization and waits for post-swap gas funding before choosing a nonce", async () => {
    checkBalance.mockResolvedValue(new Big("95000000"));
    getNativeFundingBalance.mockResolvedValue(new Big("215000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await expect(
        executor.executePhase({
          quoteId: "quote-1",
          state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
          type: RampDirection.BUY
        } as RampState)
      ).rejects.toMatchObject({ isRecoverable: true, message: expect.stringContaining("below maximum gas cost 220000") });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(runFinancialOperation).toHaveBeenCalledTimes(1);
    expect(runFinancialOperation.mock.calls[0][0]).toMatchObject({
      request: {
        destination: "0x2222222222222222222222222222222222222222",
        network: Networks.Base,
        source: fundingAccount.address,
        targetBalanceRaw: "100000000"
      },
      retryFailed: true
    });
    expect(runFinancialOperation.mock.calls[0][0].request).not.toHaveProperty("amountRaw");
    expect(runFinancialOperation.mock.calls[0][0].request).not.toHaveProperty("nonce");
    expect(getTransactionCount).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("marks a proven pre-broadcast subsidy revert as a definitive financial rejection", async () => {
    checkBalance.mockResolvedValue(new Big("95000000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    // The affordability estimate in preflight succeeds; the authoritative pre-send
    // estimate inside the claimed operation reverts with the real typed viem chain,
    // so the real classifier (not a stub) must prove the definitive rejection.
    estimateGas.mockResolvedValueOnce(21000n);
    estimateGas.mockRejectedValueOnce(
      new EstimateGasExecutionError(new ExecutionRevertedError({ message: "transfer amount exceeds balance" }), {})
    );
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await expect(
        executor.executePhase({
          quoteId: "quote-1",
          state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
          type: RampDirection.BUY
        } as RampState)
      ).rejects.toMatchObject({ isRecoverable: true });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(estimateGas).toHaveBeenCalledTimes(2);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(financialOperationFailures[0]).toBeInstanceOf(financialOperationReal.FinancialOperationRejectedError);
  });

  it("reduces the subsidy when more destination funds arrive during preflight", async () => {
    checkBalance.mockResolvedValue(new Big("100000000"));
    checkBalance.mockResolvedValueOnce(new Big("95000000"));
    getDestinationBalance.mockResolvedValue(new Big("98000000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await executor.executePhase({
        quoteId: "quote-1",
        state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
        type: RampDirection.BUY
      } as RampState);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    const transaction = sendTransaction.mock.calls[0][2];
    if (!transaction?.data) throw new Error("Expected a token transfer transaction");
    const decoded = decodeFunctionData({ abi: erc20Abi, data: transaction.data });
    expect(decoded.args?.[1]).toBe(2000000n);
    expect(transaction.gas).toBe(21000n);
    expect(executor.createSubsidy).toHaveBeenCalledWith(
      expect.anything(),
      2,
      EvmToken.USDC,
      fundingAccount.address,
      expect.any(String)
    );
  });

  it("repairs subsidy bookkeeping from the confirmed amount after the destination reaches its target", async () => {
    checkBalance.mockResolvedValue(new Big("100000000"));
    const confirmedHash = "0x1111111111111111111111111111111111111111111111111111111111111111";
    legacyFinancialOperationResponse = { hash: confirmedHash };
    const destination = "0x2222222222222222222222222222222222222222" as const;
    const token = (sharedReal.getOnChainTokenDetails(Networks.Base, EvmToken.USDC) as EvmTokenDetails)
      .erc20AddressSourceChain;
    getTransaction.mockResolvedValue({
      from: fundingAccount.address,
      input: encodeFunctionData({ abi: erc20Abi, args: [destination, 5000000n], functionName: "transfer" }),
      to: token
    });
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    await executor.executePhase({
      quoteId: "quote-1",
      state: { evmEphemeralAddress: destination },
      type: RampDirection.BUY
    } as RampState);

    expect(runFinancialOperation).toHaveBeenCalledTimes(1);
    expect(getTransaction).toHaveBeenCalledWith({ hash: confirmedHash });
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).toHaveBeenCalledWith(
      expect.anything(),
      5,
      EvmToken.USDC,
      fundingAccount.address,
      confirmedHash
    );
  });

  it.each([
    [
      "positive transfer",
      {
        amountRaw: "5000000",
        hash: "0x1111111111111111111111111111111111111111111111111111111111111111"
      },
      "50000000"
    ],
    ["no-op", { amountRaw: "0", hash: null }, "95000000"]
  ])("does not advance an underfunded phase after replaying a confirmed %s", async (_kind, replay, balanceRaw) => {
    checkBalance.mockResolvedValue(new Big(balanceRaw));
    financialOperationReplay = replay;
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          subsidizePostSwap: {
            actualOutputAmountRaw: "95000000",
            outputCurrency: EvmToken.USDC,
            outputDecimals: 6,
            subsidyAmountInOutputTokenRaw: "5000000",
            targetOutputAmountRaw: "100000000"
          }
        }
      },
      outputAmount: "100",
      outputCurrency: EvmToken.USDC
    });
    const originalConvertCurrency = priceFeedService.convertCurrency;
    const convertCurrency = mock(async (amount: string) => amount);
    priceFeedService.convertCurrency = convertCurrency as typeof priceFeedService.convertCurrency;
    const executor = Object.create(SubsidizePostSwapExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    try {
      await expect(
        executor.executePhase({
          quoteId: "quote-1",
          state: { evmEphemeralAddress: "0x2222222222222222222222222222222222222222" },
          type: RampDirection.BUY
        } as RampState)
      ).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("did not leave the destination at its target balance")
      });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(convertCurrency).not.toHaveBeenCalled();
    if (replay.hash) {
      expect(executor.createSubsidy).toHaveBeenCalledWith(
        expect.anything(),
        5,
        EvmToken.USDC,
        fundingAccount.address,
        replay.hash
      );
    }
  });

  it("uses AlfredPay SELL's quoted bridge output and records the subsidy as Polygon USDT", async () => {
    checkBalance.mockResolvedValue(new Big("900000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "200000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-1",
      quoteId: "quote-1",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        squidRouterDeliveryEvidence: {
          baselineRaw: "0",
          destinationNetwork: Networks.Polygon,
          destinationToken: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
          expectedAmountRaw: "1000000",
          kind: "destination-balance",
          minimumRatioBps: 9000,
          observedAt: "2026-01-01T00:00:00.000Z",
          sourceTransactionHash: "legacy-unavailable"
        },
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await executor.executePhase(state);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(checkEvmBalanceForToken).toHaveBeenCalledWith(expect.objectContaining({ amountDesiredRaw: "900000" }));
    expect(runFinancialOperation.mock.calls[0][0]).toMatchObject({
      request: {
        destination: "0x2222222222222222222222222222222222222222",
        network: Networks.Polygon,
        source: fundingAccount.address,
        targetBalanceRaw: "1000000"
      },
      settleAfterAbort: true
    });
    expect(runFinancialOperation.mock.calls[0][0].request).not.toHaveProperty("amountRaw");
    expect(runFinancialOperation.mock.calls[0][0].request).not.toHaveProperty("nonce");
    expect(executor.createSubsidy).toHaveBeenCalledWith(state, 0.1, EvmToken.USDT, fundingAccount.address, expect.any(String));
  });

  it.each([
    ["exact cap", "10000000", "0", "11000000000000000000"],
    ["15 bps staging case", "9431953", "0", "10375148300000000000"],
    ["partial inventory", "10000000", "4000000", "6600000000000000000"]
  ])(
    "acquires only the treasury shortfall and transfers the full subsidy (%s)",
    async (_caseName, subsidyAmountRaw, fundingInventoryRaw, expectedNativeInputRaw) => {
      const bridgeOutputAmountRaw = "1000000000";
      const inputAmountRaw = new Big(bridgeOutputAmountRaw).plus(subsidyAmountRaw).toFixed(0);
      let acquisitionConfirmed = false;
      checkBalance.mockResolvedValue(new Big(bridgeOutputAmountRaw));
      getFundingBalance.mockImplementation(async () =>
        new Big(acquisitionConfirmed ? subsidyAmountRaw : fundingInventoryRaw)
      );
      sendTransaction.mockImplementation(async (_network, _account, transaction) => {
        if (transaction?.value && transaction.value > 0n) acquisitionConfirmed = true;
        return "0x1111111111111111111111111111111111111111111111111111111111111111";
      });
      findQuote.mockResolvedValue({
        metadata: {
          blocks: {
            alfredpayOfframp: {
              bridgeOutputAmountRaw,
              inputAmountRaw,
              subsidyAmountRaw
            }
          },
          flow: { id: "AlfredpayOfframp", version: 3 },
          globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
        },
        network: Networks.Polygon,
        outputAmount: "1",
        outputCurrency: FiatToken.MXN
      });
      const state = {
        id: `ramp-acquire-${subsidyAmountRaw}`,
        quoteId: `quote-acquire-${subsidyAmountRaw}`,
        state: {
          evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
          transactionPlan: {
            settlementBaselines: {
              "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f":
                "0"
            }
          }
        },
        type: RampDirection.SELL,
        update: mock(async () => state)
      } as unknown as RampState;
      const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
      executor.createSubsidy = mock(async () => undefined);
      const originalConvertCurrency = priceFeedService.convertCurrency;
      priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

      try {
        await executor.executePhase(state);
      } finally {
        priceFeedService.convertCurrency = originalConvertCurrency;
      }

      expect(getRoute).toHaveBeenCalledTimes(2);
      expect(getRoute.mock.calls[1]?.[0]).toMatchObject({ fromAmount: expectedNativeInputRaw });
      expect(sendTransaction).toHaveBeenCalledTimes(2);
      expect(executor.createSubsidy).toHaveBeenCalledWith(
        state,
        new Big(subsidyAmountRaw).div(1_000_000).toNumber(),
        EvmToken.USDT,
        fundingAccount.address,
        expect.any(String)
      );
    }
  );

  it("does not broadcast an acquisition whose guaranteed output leaves treasury inventory insolvent", async () => {
    const bridgeOutputAmountRaw = "1000000000";
    const subsidyAmountRaw = "10000000";
    checkBalance.mockResolvedValue(new Big(bridgeOutputAmountRaw));
    getFundingBalance.mockResolvedValue(new Big(0));
    getRoute
      .mockResolvedValueOnce({
        data: {
          route: {
            estimate: { toAmount: "1000000", toAmountMin: "1000000" },
            transactionRequest: {
              data: "0x",
              gasLimit: "100000",
              target: "0x3333333333333333333333333333333333333333",
              value: "1000000000000000000"
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          route: {
            estimate: { toAmount: "11000000", toAmountMin: "7000000" },
            transactionRequest: {
              data: "0x",
              gasLimit: "100000",
              target: "0x3333333333333333333333333333333333333333",
              value: "11000000000000000000"
            }
          }
        }
      });
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-insolvent-acquisition",
      quoteId: "quote-insolvent-acquisition",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f":
              "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await expect(executor.executePhase(state)).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("below funding shortfall")
      });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(sendTransaction).not.toHaveBeenCalled();

    getRoute
      .mockResolvedValueOnce({
        data: {
          route: {
            estimate: { toAmount: "1000000", toAmountMin: "1000000" },
            transactionRequest: {
              data: "0x",
              gasLimit: "100000",
              target: "0x3333333333333333333333333333333333333333",
              value: "1000000000000000000"
            }
          }
        }
      })
      .mockResolvedValueOnce({
        data: {
          route: {
            estimate: { toAmount: "11000000", toAmountMin: "10000000" },
            transactionRequest: {
              data: "0x",
              gasLimit: "100000",
              target: "0x3333333333333333333333333333333333333333",
              value: "100000000000000000000"
            }
          }
        }
      });
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    try {
      await expect(executor.executePhase(state)).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("executable value")
      });
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }
    expect(sendTransaction).not.toHaveBeenCalled();

    getRoute.mockResolvedValueOnce({
      data: {
        route: {
          estimate: { toAmount: "900000", toAmountMin: "900000" },
          transactionRequest: {
            data: "0x",
            gasLimit: "100000",
            target: "0x3333333333333333333333333333333333333333",
            value: "1000000000000000000"
          }
        }
      }
    });
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;
    try {
      await expect(executor.executePhase(state)).rejects.toThrow("exceeds maximum allowed $11");
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("replays a confirmed acquisition before fresh route data after a balance-wait failure", async () => {
    const bridgeOutputAmountRaw = "1000000000";
    checkBalance
      .mockResolvedValueOnce(new Big(bridgeOutputAmountRaw))
      .mockRejectedValueOnce(new Error("balance RPC timeout"))
      .mockResolvedValue(new Big(bridgeOutputAmountRaw));
    let fundingBalanceReads = 0;
    getFundingBalance.mockImplementation(async () => {
      fundingBalanceReads += 1;
      return new Big(fundingBalanceReads >= 5 ? "10000000" : "0");
    });
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw: "10000000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-acquisition-replay",
      quoteId: "quote-acquisition-replay",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f":
              "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await expect(executor.executePhase(state)).rejects.toMatchObject({ isRecoverable: true });
      await expect(executor.executePhase(state)).resolves.toBe(state);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(getRoute).toHaveBeenCalledTimes(2);
    const financialCalls = sendTransaction.mock.calls as unknown as [unknown, unknown, { value: bigint }][];
    expect(financialCalls.filter(([, , transaction]) => transaction.value > 0n)).toHaveLength(1);
    expect(sendTransaction).toHaveBeenCalledTimes(2);
  });

  it("classifies acquisition route and ambiguous receipt failures as recoverable without duplicate broadcast", async () => {
    const bridgeOutputAmountRaw = "1000000000";
    checkBalance.mockResolvedValue(new Big(bridgeOutputAmountRaw));
    getFundingBalance.mockResolvedValue(new Big(0));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw: "10000000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-acquisition-errors",
      quoteId: "quote-acquisition-errors",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f":
              "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      getRoute.mockRejectedValueOnce(new Error("Squid temporarily unavailable"));
      await expect(executor.executePhase(state)).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("Squid temporarily unavailable")
      });
      expect(sendTransaction).not.toHaveBeenCalled();

      waitForTransactionReceipt.mockRejectedValueOnce(new Error("receipt RPC timeout"));
      await expect(executor.executePhase(state)).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("receipt RPC timeout")
      });
      expect(sendTransaction).toHaveBeenCalledTimes(1);

      await expect(executor.executePhase(state)).rejects.toThrow("requires reconciliation");
      expect(sendTransaction).toHaveBeenCalledTimes(1);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }
  });

  it("does not fund AlfredPay bridge under-delivery below the delivery gate", async () => {
    // 80% delivered, under the 90% arrival threshold: the gate itself refuses, so the phase
    // never reaches the settlement cap and treasury sends nothing.
    checkBalance.mockResolvedValue(new Big("800000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "0"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-under-delivery",
      quoteId: "quote-under-delivery",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    await expect(executor.executePhase(state)).rejects.toMatchObject({
      message: expect.stringContaining("Balance did not meet the limit")
    });

    expect(checkEvmBalanceForToken).toHaveBeenCalledWith(expect.objectContaining({ amountDesiredRaw: "900000" }));
    expect(executor.createSubsidy).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("funds an AlfredPay bridge shortfall that sits inside the delivery gate", async () => {
    // Exactly the 90% arrival threshold: the gate accepted this delivery, so the settlement cap
    // must accept it too. Anything else strands a ramp whose provider order is already bound to
    // the full quoted deposit.
    checkBalance.mockResolvedValue(new Big("900000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "0"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-gate-shortfall",
      quoteId: "quote-gate-shortfall",
      state: {
        evmEphemeralAddress: "0x2222222222222222222222222222222222222222",
        transactionPlan: {
          settlementBaselines: {
            "polygon:0x2222222222222222222222222222222222222222:0xc2132d05d31c914a87c6611c10748aeb04b58e8f": "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);

    const error = await executor.executePhase(state).then(
      () => null,
      (thrown: unknown) => thrown
    );

    expect((error as { message?: string } | null)?.message ?? "").not.toContain("subsidy cap");
  });

  it("refreshes the final settlement shortfall after acquiring the funding slot", async () => {
    const ephemeralAddress = "0x2222222222222222222222222222222222222222";
    checkBalance.mockResolvedValue(new Big("900000"));
    beforeSerializedFundingOperation = () => {
      checkBalance.mockResolvedValue(new Big("1000000"));
    };
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "100000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 3 },
        globals: { fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", vortex: "0" } }, request: {} }
      },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-1",
      quoteId: "quote-1",
      state: {
        evmEphemeralAddress: ephemeralAddress,
        transactionPlan: {
          settlementBaselines: {
            [`polygon:${ephemeralAddress}:0xc2132d05d31c914a87c6611c10748aeb04b58e8f`]: "0"
          }
        }
      },
      type: RampDirection.SELL,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await executor.executePhase(state);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(runSerializedEvmFundingOperation).toHaveBeenCalledTimes(1);
    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("uses the canonical final settlement raw amount instead of the rounded quote output", async () => {
    const ephemeralAddress = "0x2222222222222222222222222222222222222222";
    const outputToken = sharedReal.evmTokenConfig[Networks.Arbitrum][EvmToken.USDC]!;
    const canonicalAmountRaw = "4979924167";
    checkBalance.mockResolvedValue(new Big(canonicalAmountRaw));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          finalSettlementSubsidy: { amountRaw: canonicalAmountRaw },
          squidRouterSwap: {
            outputAmountRaw: canonicalAmountRaw,
            toNetwork: Networks.Arbitrum,
            toToken: outputToken.erc20AddressSourceChain
          }
        }
      },
      network: Networks.Arbitrum,
      outputAmount: "4979.924168",
      outputCurrency: EvmToken.USDC
    });
    const state = {
      id: "ramp-1",
      quoteId: "quote-1",
      state: {
        evmEphemeralAddress: ephemeralAddress,
        transactionPlan: {
          settlementBaselines: {
            [`${Networks.Arbitrum}:${ephemeralAddress}:${outputToken.erc20AddressSourceChain.toLowerCase()}`]: "0"
          }
        }
      },
      type: RampDirection.BUY,
      update: mock(async () => state)
    } as unknown as RampState;
    const executor = Object.create(FinalSettlementSubsidyExecutor.prototype) as any;
    executor.createSubsidy = mock(async () => undefined);
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await executor.executePhase(state);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(executor.createSubsidy).not.toHaveBeenCalled();
  });

  it("propagates rejected AlfredPay statuses and records on-chain completion while balance confirmation continues", async () => {
    const executor = Object.create(AlfredpayOnrampMintExecutor.prototype) as any;
    const state = { state: {}, update: mock(async () => state) } as unknown as RampState;
    const controller = new AbortController();
    getOnrampTransaction.mockRejectedValueOnce({ failureReason: "rejected", kind: "failed" });

    await expect(executor.pollStatus("tx-1", state, 0, controller.signal)).rejects.toEqual({
      failureReason: "rejected",
      kind: "failed"
    });

    getOnrampTransaction.mockClear();
    getOnrampTransaction.mockResolvedValue({
      metadata: { txHash: "0x2222222222222222222222222222222222222222222222222222222222222222" },
      status: AlfredpayOnrampStatus.ON_CHAIN_COMPLETED
    });
    const polling = executor.pollStatus("tx-2", state, 1, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();
    await polling.catch(() => undefined);

    expect(getOnrampTransaction.mock.calls.length).toBeGreaterThan(1);
    expect(state.update).toHaveBeenCalledWith({
      state: {
        alfredpayOnrampMintTxHash: "0x2222222222222222222222222222222222222222222222222222222222222222"
      }
    });
  });
});
