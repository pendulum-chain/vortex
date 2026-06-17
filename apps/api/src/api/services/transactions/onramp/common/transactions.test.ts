import {beforeEach, describe, expect, it, mock} from "bun:test";
import type {AccountMeta, UnsignedTx} from "@vortexfi/shared";
import type {QuoteTicketAttributes} from "../../../../../models/quoteTicket.model";

const Networks = {
  Base: "base",
  Moonbeam: "moonbeam"
} as const;

const createNablaTransactionsForOnrampOnEVM = mock(async () => ({
  approve: {
    data: "0xapprove",
    gas: "100000",
    to: "0xinput",
    value: "0"
  },
  swap: {
    data: "0xswap",
    gas: "200000",
    to: "0xrouter",
    value: "0"
  }
}));

mock.module("@vortexfi/shared", () => ({
  AMM_MINIMUM_OUTPUT_HARD_MARGIN: 0.02,
  AMM_MINIMUM_OUTPUT_SOFT_MARGIN: 0.01,
  createMoonbeamToPendulumXCM: mock(async () => "0xmoonbeam"),
  createNablaTransactionsForOnramp: mock(async () => ({ approve: "0xapprove", swap: "0xswap" })),
  createNablaTransactionsForOnrampOnEVM,
  encodeSubmittableExtrinsic: (tx: unknown) => tx,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        estimateFeesPerGas: mock(async () => ({ maxFeePerGas: 1n, maxPriorityFeePerGas: 1n }))
      })
    })
  },
  getNablaBasePool: () => ({ router: "0xrouter" }),
  getNetworkId: () => 1,
  Networks
}));

mock.module("../../../../../config/vars", () => ({
  config: {
    swap: {
      deadlineMinutes: 20
    }
  }
}));

mock.module("../../moonbeam/cleanup", () => ({
  prepareMoonbeamCleanupTransaction: mock(async () => "0xcleanup")
}));

mock.module("../../pendulum/cleanup", () => ({
  preparePendulumCleanupTransaction: mock(async () => "0xcleanup")
}));

const {addNablaSwapTransactionsOnBase} = await import("./transactions");

function createQuote(ammOutputAmountRaw?: string): QuoteTicketAttributes {
  return {
    metadata: {
      nablaSwapEvm: {
        ammOutputAmountRaw,
        inputAmountForSwapRaw: "100000000",
        outputAmountRaw: "110000000"
      }
    }
  } as unknown as QuoteTicketAttributes;
}

describe("addNablaSwapTransactionsOnBase", () => {
  const account = {
    address: "0x1111111111111111111111111111111111111111",
    type: "EVM"
  } as unknown as AccountMeta;

  beforeEach(() => {
    createNablaTransactionsForOnrampOnEVM.mockClear();
  });

  it("uses AMM-only output for Nabla minimums when subsidy was merged into the quote", async () => {
    const unsignedTxs: UnsignedTx[] = [];

    const result = await addNablaSwapTransactionsOnBase(
      {
        account,
        inputTokenAddress: "0x2222222222222222222222222222222222222222",
        outputTokenAddress: "0x3333333333333333333333333333333333333333",
        quote: createQuote("100000000")
      },
      unsignedTxs,
      7
    );

    expect(createNablaTransactionsForOnrampOnEVM.mock.calls[0][4]).toBe("98000000");
    expect(result.stateMeta.nablaSoftMinimumOutputRaw).toBe("99000000");
    expect(unsignedTxs.map(tx => tx.phase)).toEqual(["nablaApprove", "nablaSwap"]);
    expect(result.nextNonce).toBe(9);
  });

  it("falls back to outputAmountRaw for quotes without an AMM-only output snapshot", async () => {
    const result = await addNablaSwapTransactionsOnBase(
      {
        account,
        inputTokenAddress: "0x2222222222222222222222222222222222222222",
        outputTokenAddress: "0x3333333333333333333333333333333333333333",
        quote: createQuote()
      },
      [],
      0
    );

    expect(createNablaTransactionsForOnrampOnEVM.mock.calls[0][4]).toBe("107800000");
    expect(result.stateMeta.nablaSoftMinimumOutputRaw).toBe("108900000");
  });
});
