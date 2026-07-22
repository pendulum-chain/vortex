import { afterAll, describe, expect, it, mock } from "bun:test";
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
  BrlaApiService: { getInstance: () => ({ getAveniaPayoutTicket: getTicket }) }
}));
mock.module("../../../avenia/avenia-customer.service", () => ({
  ...customerReal,
  findAveniaCustomerByTaxId: async () => ({ providerSubaccountId: "subaccount-1" })
}));

const { AveniaOfframpPayoutExecutor } = await import("../phases/avenia-offramp-payout/execution");
const originalFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  QuoteTicket.findByPk = originalFindByPk;
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../../avenia/avenia-customer.service", () => ({ ...customerReal }));
});

describe("AssetHub BRL payout recovery", () => {
  it("resumes a persisted PIX ticket without requiring or rebroadcasting a Base payout transaction", async () => {
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
    const state = {
      quoteId: "quote-1",
      state: {
        blockState: {
          aveniaPendulumOfframp: {
            brlaEvmAddress: "0x1111111111111111111111111111111111111111",
            pixDestination: "pix-key",
            receiverTaxId: "12345678900",
            taxId: "12345678901"
          }
        },
        payOutTicketId: "ticket-1"
      }
    } as unknown as RampState;
    const executor = new AveniaOfframpPayoutExecutor() as unknown as {
      executePhase(state: RampState): Promise<RampState>;
    };
    expect(await executor.executePhase(state)).toBe(state);
    expect(getTicket).toHaveBeenCalledWith("ticket-1", "subaccount-1");
  });
});
