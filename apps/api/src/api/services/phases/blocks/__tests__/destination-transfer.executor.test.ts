import { afterAll, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";

const sharedReal = { ...sharedNamespace };

const checkEvmBalanceForToken = mock(async () => {
  throw new Error("balance-check sentinel");
});

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({ getClient: () => ({}) })
  }
}));

const { default: QuoteTicket } = await import("../../../../../models/quoteTicket.model");
const { DestinationTransferExecutor } = await import("../phases/destination-transfer/execution");
const realQuoteTicketFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
});

// quote.outputAmount rounds to one raw unit MORE than the canonical presigned amount;
// the precondition must demand the canonical amount or the ramp wedges forever.
QuoteTicket.findByPk = mock(async () => ({
  metadata: {
    blocks: {
      destinationTransfer: {
        amountDecimal: "4979.9241675",
        amountRaw: "4979924167",
        network: sharedReal.Networks.Base,
        token: sharedReal.EvmToken.USDC
      }
    }
  },
  network: sharedReal.Networks.Base,
  outputAmount: "4979.924168",
  outputCurrency: sharedReal.EvmToken.USDC
})) as typeof QuoteTicket.findByPk;

function makeState() {
  return {
    currentPhase: "destinationTransfer",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs: [
      {
        meta: {},
        network: sharedReal.Networks.Base,
        nonce: 0,
        phase: "destinationTransfer",
        signer: "0x1111111111111111111111111111111111111111",
        txData: "0xdead"
      }
    ],
    quoteId: "quote-1",
    state: {},
    type: sharedReal.RampDirection.BUY,
    async update(updateData: Record<string, unknown>) {
      Object.assign(this, updateData);
      return this;
    }
  } as any;
}

describe("DestinationTransferExecutor balance precondition", () => {
  it("demands the canonical presigned raw amount, not a reconstruction of quote.outputAmount", async () => {
    await expect(new DestinationTransferExecutor().execute(makeState())).rejects.toThrow("balance-check sentinel");

    expect(checkEvmBalanceForToken).toHaveBeenCalledWith(expect.objectContaining({ amountDesiredRaw: "4979924167" }));
  });
});
