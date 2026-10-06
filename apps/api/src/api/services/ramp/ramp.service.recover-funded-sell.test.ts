import { afterEach, describe, expect, it, mock } from "bun:test";
import { FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import type { Transaction } from "sequelize";
import { config } from "../../../config/vars";
import QuoteTicket from "../../../models/quoteTicket.model";
import RampState from "../../../models/rampState.model";
import { RampService } from "./ramp.service";

class TestRampService extends RampService {
  protected async withTransaction<T>(callback: (transaction: Transaction) => Promise<T>): Promise<T> {
    return callback({} as Transaction);
  }
}

const originalQuoteFindByPk = QuoteTicket.findByPk;
const originalRampFindByPk = RampState.findByPk;

afterEach(() => {
  QuoteTicket.findByPk = originalQuoteFindByPk;
  RampState.findByPk = originalRampFindByPk;
});

function stubRampAndQuote(
  ramp: { from?: Networks; state: Record<string, unknown>; to?: string; type: RampDirection },
  outputCurrency: string
) {
  RampState.findByPk = mock(async () => ({
    createdAt: new Date(Date.now() - 60 * 60 * 1000),
    currentPhase: "initial",
    flowVariant: config.flowVariant,
    from: Networks.Ethereum,
    id: "ramp-1",
    presignedTxs: [],
    quoteId: "quote-1",
    to: "pix",
    unsignedTxs: [],
    ...ramp
  })) as unknown as typeof RampState.findByPk;
  QuoteTicket.findByPk = mock(async () => ({
    id: "quote-1",
    metadata: { blocks: {}, flow: { id: "BrlOfframpBase" }, globals: { fees: { usd: {} }, request: {} } },
    outputCurrency
  })) as unknown as typeof QuoteTicket.findByPk;
}

describe("RampService.recoverFundedSellRamp guards", () => {
  const conflict = { message: "Ramp does not have a reported source transaction", status: httpStatus.CONFLICT };

  it("refuses a SELL ramp whose source transaction hash was never reported", async () => {
    stubRampAndQuote({ state: {}, type: RampDirection.SELL }, FiatToken.BRL);

    await expect(new TestRampService().recoverFundedSellRamp("ramp-1")).rejects.toMatchObject(conflict);
  });

  it("refuses a BUY ramp even when a hash-shaped field is present", async () => {
    stubRampAndQuote({ state: { squidRouterSwapHash: "0xabc" }, type: RampDirection.BUY }, FiatToken.BRL);

    await expect(new TestRampService().recoverFundedSellRamp("ramp-1")).rejects.toMatchObject(conflict);
  });

  it("refuses a domestic (AlfredPay) SELL whose reported hash FundEphemeral does not verify", async () => {
    stubRampAndQuote({ state: { squidRouterNoPermitTransferHash: "0xabc" }, type: RampDirection.SELL }, FiatToken.MXN);

    await expect(new TestRampService().recoverFundedSellRamp("ramp-1")).rejects.toMatchObject(conflict);
  });

  it("refuses an AssetHub SELL whose reported Squid hash FundEphemeral does not verify", async () => {
    stubRampAndQuote(
      {
        from: Networks.AssetHub,
        state: { assethubToPendulumHash: "0xdef", squidRouterSwapHash: "0xabc" },
        to: "sepa",
        type: RampDirection.SELL
      },
      FiatToken.EURC
    );

    await expect(new TestRampService().recoverFundedSellRamp("ramp-1")).rejects.toMatchObject(conflict);
  });
});
