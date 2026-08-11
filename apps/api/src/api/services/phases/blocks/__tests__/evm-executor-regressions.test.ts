import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { AlfredpayOnrampStatus, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
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
const getOnrampTransaction = mock(
  async (): Promise<{ metadata?: { txHash?: string }; status: AlfredpayOnrampStatus }> => ({
    status: AlfredpayOnrampStatus.CREATED
  })
);
const sendTransaction = mock(
  async () => "0x1111111111111111111111111111111111111111111111111111111111111111" as `0x${string}`
);
const waitForTransactionReceipt = mock(async () => ({ status: "success" as const }));
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  AlfredpayApiService: { getInstance: () => ({ getOnrampTransaction }) },
  checkEvmBalanceForToken: checkBalance,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 1n }),
        getTransactionCount: async () => 0,
        waitForTransactionReceipt
      }),
      sendTransactionWithBlindRetry: sendTransaction
    })
  },
  getEvmBalance: getFundingBalance,
  getRoute
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
  runFinancialOperation: async ({
    attemptClass,
    beforePerform,
    perform
  }: {
    attemptClass: string;
    beforePerform?(): Promise<void>;
    perform(key: string): Promise<unknown>;
  }) => {
    const existing = financialOperationOutcomes.get(attemptClass);
    if (existing?.status === "confirmed") return existing.response;
    if (existing?.status === "unknown") {
      throw Object.assign(new Error("financial operation requires reconciliation"), {
        requiresManualReconciliation: true
      });
    }
    await beforePerform?.();
    try {
      const response = await perform(`test-operation:${attemptClass}`);
      financialOperationOutcomes.set(attemptClass, { response, status: "confirmed" });
      return response;
    } catch (error) {
      financialOperationOutcomes.set(attemptClass, { status: "unknown" });
      throw error;
    }
  }
}));
const { SubsidizePostSwapExecutor } = await import("../phases/subsidize-post/execution");
const { FinalSettlementSubsidyExecutor } = await import("../phases/final-settlement-subsidy/execution");
const { getAlfredpayExecutableBridgeOutputRaw } = await import("../phases/alfredpay-offramp/simulation");
const { AlfredpayOnrampMintExecutor } = await import("../phases/alfredpay-mint/execution");

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
  getFundingBalance.mockClear();
  getFundingBalance.mockResolvedValue(new Big("1000000000"));
  getRoute.mockClear();
  getOnrampTransaction.mockClear();
  sendTransaction.mockClear();
  waitForTransactionReceipt.mockClear();
});

describe("EVM block executor regressions", () => {
  it("splits BUY subsidy components and skips zero-value currency conversion", async () => {
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
    checkBalance.mockResolvedValue(new Big("563600"));
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

  it("uses AlfredPay SELL's guaranteed bridge minimum and records the subsidy as Polygon USDT", async () => {
    checkBalance.mockResolvedValue(new Big("900000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            executableBridgeOutputRaw: "800000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "200000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 4 },
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
          expectedAmountRaw: "800000",
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

    expect(checkBalance).toHaveBeenCalledWith(expect.objectContaining({ amountDesiredRaw: "720000" }));
    expect(executor.createSubsidy).toHaveBeenCalledWith(state, 0.1, EvmToken.USDT, fundingAccount.address, expect.any(String));
  });

  it.each([
    ["exact cap", "10000000", "0", "11000000000000000000"],
    ["15 bps staging case", "9431953", "0", "10375148300000000000"],
    ["partial inventory", "10000000", "4000000", "6600000000000000000"]
  ])(
    "acquires only the treasury shortfall and transfers the full subsidy (%s)",
    async (_caseName, subsidyAmountRaw, fundingInventoryRaw, expectedNativeInputRaw) => {
      const executableBridgeOutputRaw = "1000000000";
      const inputAmountRaw = new Big(executableBridgeOutputRaw).plus(subsidyAmountRaw).toFixed(0);
      checkBalance.mockResolvedValue(new Big(executableBridgeOutputRaw));
      getFundingBalance.mockResolvedValue(new Big(fundingInventoryRaw));
      findQuote.mockResolvedValue({
        metadata: {
          blocks: {
            alfredpayOfframp: {
              bridgeOutputAmountRaw: executableBridgeOutputRaw,
              executableBridgeOutputRaw,
              inputAmountRaw,
              subsidyAmountRaw
            }
          },
          flow: { id: "AlfredpayOfframp", version: 4 },
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
    const executableBridgeOutputRaw = "1000000000";
    const subsidyAmountRaw = "10000000";
    checkBalance.mockResolvedValue(new Big(executableBridgeOutputRaw));
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
            bridgeOutputAmountRaw: executableBridgeOutputRaw,
            executableBridgeOutputRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw
          }
        },
        flow: { id: "AlfredpayOfframp", version: 4 },
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
    const executableBridgeOutputRaw = "1000000000";
    checkBalance
      .mockResolvedValueOnce(new Big(executableBridgeOutputRaw))
      .mockRejectedValueOnce(new Error("balance RPC timeout"))
      .mockResolvedValue(new Big(executableBridgeOutputRaw));
    getFundingBalance.mockResolvedValue(new Big(0));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: executableBridgeOutputRaw,
            executableBridgeOutputRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw: "10000000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 4 },
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
    const executableBridgeOutputRaw = "1000000000";
    checkBalance.mockResolvedValue(new Big(executableBridgeOutputRaw));
    getFundingBalance.mockResolvedValue(new Big(0));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: executableBridgeOutputRaw,
            executableBridgeOutputRaw,
            inputAmountRaw: "1010000000",
            subsidyAmountRaw: "10000000"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 4 },
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

  it("fails closed when schema-3 executable minimum metadata disagrees with settlement arithmetic", () => {
    expect(() =>
      getAlfredpayExecutableBridgeOutputRaw(
        { executableBridgeOutputRaw: "800001", inputAmountRaw: "1000000", subsidyAmountRaw: "200000" },
        { network: "0", partnerMarkup: "0", vortex: "0" }
      )
    ).toThrow("executable bridge minimum mismatch");
  });

  it("does not fund AlfredPay bridge under-delivery beyond the quoted subsidy", async () => {
    checkBalance.mockResolvedValue(new Big("900000"));
    findQuote.mockResolvedValue({
      metadata: {
        blocks: {
          alfredpayOfframp: {
            bridgeOutputAmountRaw: "1000000",
            executableBridgeOutputRaw: "1000000",
            inputAmountRaw: "1000000",
            subsidyAmountRaw: "0"
          }
        },
        flow: { id: "AlfredpayOfframp", version: 4 },
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
      isRecoverable: true,
      message: expect.stringContaining("subsidy cap")
    });

    expect(checkBalance).toHaveBeenCalledWith(expect.objectContaining({ amountDesiredRaw: "900000" }));
    expect(executor.createSubsidy).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
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
