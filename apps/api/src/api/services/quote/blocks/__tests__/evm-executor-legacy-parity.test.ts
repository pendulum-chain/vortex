import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { AlfredpayOnrampStatus, EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import type RampState from "../../../../../models/rampState.model";
import * as quoteTicketNamespace from "../../../../../models/quoteTicket.model";
import * as evmFundingNamespace from "../../../phases/evm-funding";
import { priceFeedService } from "../../../priceFeed.service";

const sharedReal = { ...sharedNamespace };
const quoteTicketReal = { ...quoteTicketNamespace };
const evmFundingReal = { ...evmFundingNamespace };
const findQuote = mock(async () => undefined as unknown);
const checkBalance = mock(async () => new Big(0));
const getFundingBalance = mock(async () => new Big("1000000000"));
const getOnrampTransaction = mock(async () => ({ status: AlfredpayOnrampStatus.CREATED }));
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
        waitForTransactionReceipt
      }),
      sendTransactionWithBlindRetry: sendTransaction
    })
  },
  getEvmBalance: getFundingBalance
}));
mock.module("../../../../../models/quoteTicket.model", () => ({
  ...quoteTicketReal,
  default: { findByPk: findQuote }
}));
mock.module("../../../phases/evm-funding", () => ({
  ...evmFundingReal,
  getEvmFundingAccount: () => fundingAccount
}));
const { SubsidizePostSwapExecutor } = await import("../phases/subsidize-post/execution");
const { FinalSettlementSubsidyExecutor } = await import("../phases/final-settlement-subsidy/execution");
const { AlfredpayOnrampMintExecutor } = await import("../phases/alfredpay-mint/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../../../models/quoteTicket.model", () => ({ ...quoteTicketReal }));
  mock.module("../../../phases/evm-funding", () => ({ ...evmFundingReal }));
});

beforeEach(() => {
  findQuote.mockClear();
  checkBalance.mockClear();
  getFundingBalance.mockClear();
  getOnrampTransaction.mockClear();
  sendTransaction.mockClear();
  waitForTransactionReceipt.mockClear();
});

describe("EVM block executor legacy parity", () => {
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

    await executor.executePhase(state);

    expect(executor.createSubsidy).toHaveBeenCalledWith(state, 0.1, EvmToken.USDT, fundingAccount.address, expect.any(String));
  });

  it("propagates rejected AlfredPay failed statuses and stops polling on on-chain completion", async () => {
    const executor = Object.create(AlfredpayOnrampMintExecutor.prototype) as any;
    const state = { state: {}, update: mock(async () => state) } as unknown as RampState;
    const controller = new AbortController();
    getOnrampTransaction.mockRejectedValueOnce({ failureReason: "rejected", kind: "failed" });

    await expect(executor.pollStatus("tx-1", state, 0, controller.signal)).rejects.toEqual({
      failureReason: "rejected",
      kind: "failed"
    });

    getOnrampTransaction.mockClear();
    getOnrampTransaction.mockResolvedValue({ status: AlfredpayOnrampStatus.ON_CHAIN_COMPLETED });
    void executor.pollStatus("tx-2", state, 0, controller.signal);
    await new Promise(resolve => setTimeout(resolve, 10));
    controller.abort();

    expect(getOnrampTransaction).toHaveBeenCalledTimes(1);
  });
});
