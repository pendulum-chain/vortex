import { afterAll, describe, expect, it, mock, spyOn } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { AveniaTicketStatus } from "@vortexfi/shared";
import * as customerNamespace from "../../../avenia/avenia-customer.service";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";

const sharedReal = { ...sharedNamespace };
const customerReal = { ...customerNamespace };
const getTicket = mock(async () => ({ status: AveniaTicketStatus.PAID }));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  BrlaApiService: { getInstance: () => ({ getAveniaPayoutTicket: getTicket }) },
  sleep: async () => undefined
}));
mock.module("../../../avenia/avenia-customer.service", () => ({
  ...customerReal,
  findAveniaCustomerByTaxId: async () => ({ providerSubaccountId: "replacement-subaccount" })
}));
const { AveniaOfframpPayoutExecutor } = await import("../phases/avenia-offramp-payout/execution");
const originalFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  QuoteTicket.findByPk = originalFindByPk;
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../avenia/avenia-customer.service", () => ({ ...customerReal }));
});

function persistedTicketRamp(): RampState {
  QuoteTicket.findByPk = mock(async () => ({
    metadata: {
      blocks: {
        aveniaPendulumOfframp: {
          payoutAmountDecimal: "498",
          payoutAmountRaw: "49800",
          pendulumCurrencyId: { XCM: 2 },
          transferAmountDecimal: "499",
          transferAmountRaw: "499000000000000000000",
          transferNetwork: "moonbeam"
        }
      },
      globals: { fees: { usd: {} }, request: {} }
    }
  })) as typeof QuoteTicket.findByPk;
  return {
    quoteId: "quote-1",
    state: {
      blockState: {
        aveniaPendulumOfframp: {
          brlaEvmAddress: "0x1111111111111111111111111111111111111111",
          pixDestination: "pix-key",
          receiverTaxId: "12345678900",
          subAccountId: "subaccount-1",
          taxId: "12345678901"
        }
      },
      payOutTicketId: "ticket-1"
    }
  } as unknown as RampState;
}

describe("AssetHub BRL payout recovery", () => {
  it("resumes a persisted PIX ticket without requiring or rebroadcasting a Base payout transaction", async () => {
    const state = persistedTicketRamp();
    const executor = new AveniaOfframpPayoutExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    expect(await executor.executePhase(state)).toBe(state);
    expect(getTicket).toHaveBeenCalledWith("ticket-1", "subaccount-1");
  });

  it("keeps a paid-out ramp retryable when reading its payout ticket keeps failing", async () => {
    const state = persistedTicketRamp();
    getTicket.mockImplementation(async () => {
      throw new Error("Avenia: scripted 503");
    });
    // The poll's five-minute budget runs out after the first failed read.
    const start = Date.now();
    let clockReads = 0;
    const clock = spyOn(Date, "now").mockImplementation(() => start + (++clockReads > 2 ? 6 * 60 * 1000 : 0));
    const executor = new AveniaOfframpPayoutExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    try {
      await expect(executor.executePhase(state)).rejects.toMatchObject({
        isRecoverable: true,
        message: expect.stringContaining("polling failed: Error: Avenia: scripted 503")
      });
    } finally {
      clock.mockRestore();
      getTicket.mockImplementation(async () => ({ status: AveniaTicketStatus.PAID }));
    }
  });

  it("classifies a missing presigned Base payout as recoverable", async () => {
    const executor = Object.create(AveniaOfframpPayoutExecutor.prototype) as any;
    const state = { presignedTxs: [], state: {} } as unknown as RampState;

    await expect(executor.sendPayoutTransfer(state)).rejects.toMatchObject({ isRecoverable: true });
  });
});
