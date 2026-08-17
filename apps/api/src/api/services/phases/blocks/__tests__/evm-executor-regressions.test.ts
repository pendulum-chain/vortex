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
const findQuote = mock(async () => undefined as unknown);
const checkBalance = mock(async () => new Big(0));
const getFundingBalance = mock(async () => new Big("1000000000"));
const getDestinationBalance = mock(async () => checkBalance());
const getNativeFundingBalance = mock(async () => new Big("1000000000"));
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
    _transaction?: { data?: `0x${string}`; gas?: bigint; nonce?: number }
  ) => "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`
);
const estimateGas = mock(async () => 21000n);
const getTransaction = mock(async (): Promise<{ from: `0x${string}`; input: `0x${string}`; to: `0x${string}` }> => {
  throw new Error("Unexpected transaction lookup");
});
const getTransactionCount = mock(async () => 0);
const waitForTransactionReceipt = mock(async () => ({ status: "success" as const }));
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };
const financialOperationFailures: unknown[] = [];
let financialOperationReplay: unknown;
let legacyFinancialOperationResponse: unknown;
const runFinancialOperation = mock(
  async ({
    beforePerform,
    perform,
    reconcile
  }: {
    beforePerform?(): Promise<void>;
    perform(key: string): Promise<unknown>;
    reconcile?(operation: { response: unknown }): Promise<unknown | null>;
    request: Record<string, unknown>;
    retryFailed?: boolean;
  }) => {
    if (financialOperationReplay !== undefined) return financialOperationReplay;
    if (legacyFinancialOperationResponse !== undefined) {
      const reconciled = await reconcile?.({ response: legacyFinancialOperationResponse });
      if (reconciled === null || reconciled === undefined) throw new Error("Legacy operation requires reconciliation");
      return reconciled;
    }
    await beforePerform?.();
    try {
      return await perform("test-operation");
    } catch (error) {
      financialOperationFailures.push(error);
      throw error;
    }
  }
);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  AlfredpayApiService: { getInstance: () => ({ getOnrampTransaction }) },
  // Faithful to the real poller: resolves only at or above the desired amount and
  // throws a Timeout BalanceCheckError otherwise — it never returns a low balance.
  checkEvmBalanceForToken: async ({ amountDesiredRaw }: { amountDesiredRaw: string }) => {
    const balance = await checkBalance();
    if (balance.lt(amountDesiredRaw)) {
      throw new sharedReal.BalanceCheckError(
        sharedReal.BalanceCheckErrorType.Timeout,
        "Balance did not meet the limit within 5000ms"
      );
    }
    return balance;
  },
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n }),
        estimateGas,
        getTransaction,
        getTransactionCount,
        readContract: async () => 10000n,
        waitForTransactionReceipt
      }),
      sendTransactionWithBlindRetry: sendTransaction
    })
  },
  getEvmBalance: ({ ownerAddress }: { ownerAddress: string }) =>
    ownerAddress.toLowerCase() === fundingAccount.address.toLowerCase()
      ? getFundingBalance()
      : getDestinationBalance(),
  getEvmNativeBalance: getNativeFundingBalance,
  isDeterministicPreBroadcastRevert
}));
mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuote }
}));
mock.module("../core/evm-funding", () => ({
  ...evmFundingReal,
  getEvmFundingAccount: () => fundingAccount
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

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
  mock.module("../core/evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

beforeEach(() => {
  findQuote.mockClear();
  checkBalance.mockClear();
  checkBalance.mockResolvedValue(new Big(0));
  getFundingBalance.mockClear();
  getFundingBalance.mockResolvedValue(new Big("1000000000"));
  getDestinationBalance.mockClear();
  getDestinationBalance.mockImplementation(async () => checkBalance());
  getNativeFundingBalance.mockClear();
  getNativeFundingBalance.mockResolvedValue(new Big("1000000000"));
  isDeterministicPreBroadcastRevert.mockClear();
  getOnrampTransaction.mockClear();
  sendTransaction.mockClear();
  estimateGas.mockClear();
  getTransaction.mockClear();
  getTransactionCount.mockClear();
  runFinancialOperation.mockClear();
  financialOperationReplay = undefined;
  legacyFinancialOperationResponse = undefined;
  financialOperationFailures.length = 0;
  waitForTransactionReceipt.mockClear();
});

describe("EVM block executor regressions", () => {
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

  it("records AlfredPay SELL settlement subsidy as Polygon USDT", async () => {
    checkBalance.mockResolvedValue(new Big("900000"));
    findQuote.mockResolvedValue({
      metadata: { blocks: { alfredpayOfframp: { inputAmountRaw: "1000000" } } },
      network: Networks.Polygon,
      outputAmount: "1",
      outputCurrency: FiatToken.MXN
    });
    const state = {
      id: "ramp-1",
      quoteId: "quote-1",
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
    const originalConvertCurrency = priceFeedService.convertCurrency;
    priceFeedService.convertCurrency = mock(async amount => String(amount)) as typeof priceFeedService.convertCurrency;

    try {
      await executor.executePhase(state);
    } finally {
      priceFeedService.convertCurrency = originalConvertCurrency;
    }

    expect(executor.createSubsidy).toHaveBeenCalledWith(state, 0.1, EvmToken.USDT, fundingAccount.address, expect.any(String));
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
