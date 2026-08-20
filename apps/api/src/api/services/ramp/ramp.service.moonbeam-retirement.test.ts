import { afterEach, beforeEach, describe, expect, it, mock } from "bun:test";
import { EPaymentMethod, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
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

const metadata = {
  blocks: {},
  flow: { id: "BrlOnrampAssethubUsdc" },
  globals: {
    fees: { usd: {} },
    request: {}
  }
};

function stubQuote() {
  QuoteTicket.findByPk = mock(async () => ({
    expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    flowVariant: config.flowVariant,
    from: EPaymentMethod.PIX,
    id: "quote-1",
    inputCurrency: FiatToken.BRL,
    metadata,
    outputCurrency: "USDC",
    rampType: RampDirection.BUY,
    status: "pending",
    to: Networks.AssetHub,
    userId: "user-1"
  })) as unknown as typeof QuoteTicket.findByPk;
}

beforeEach(stubQuote);

afterEach(() => {
  QuoteTicket.findByPk = originalQuoteFindByPk;
  RampState.findByPk = originalRampFindByPk;
});

describe("RampService Moonbeam retirement", () => {
  it("rejects transaction updates before Moonbeam presign validation or state mutation", async () => {
    const update = mock(async () => undefined);
    RampState.findByPk = mock(async () => ({
      currentPhase: "initial",
      flowVariant: config.flowVariant,
      from: EPaymentMethod.PIX,
      id: "ramp-1",
      presignedTxs: [],
      quoteId: "quote-1",
      state: { flow: { id: "BrlOnrampAssethubUsdc" } },
      to: Networks.AssetHub,
      unsignedTxs: [],
      update
    })) as unknown as typeof RampState.findByPk;

    const service = new TestRampService();
    await expect(
      service.updateRamp({ additionalData: {}, presignedTxs: [], rampId: "ramp-1" })
    ).rejects.toMatchObject({ status: httpStatus.SERVICE_UNAVAILABLE });
    expect(update).not.toHaveBeenCalled();
  });

  it("rejects public and provider-paid starts before persisted flow execution", async () => {
    RampState.findByPk = mock(async () => ({
      createdAt: new Date(),
      currentPhase: "initial",
      flowVariant: config.flowVariant,
      from: EPaymentMethod.PIX,
      id: "ramp-1",
      quoteId: "quote-1",
      state: { aveniaTicketId: "ticket-1", flow: { id: "BrlOnrampAssethubUsdc" } },
      to: Networks.AssetHub,
      unsignedTxs: []
    })) as unknown as typeof RampState.findByPk;

    const service = new TestRampService();
    for (const start of [() => service.startRamp({ rampId: "ramp-1" }), () => service.recoverPaidAveniaRamp("ramp-1")]) {
      await expect(start()).rejects.toMatchObject({ status: httpStatus.SERVICE_UNAVAILABLE });
    }
  });
});
