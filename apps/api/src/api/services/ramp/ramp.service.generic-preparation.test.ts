import { afterAll, describe, expect, it, mock } from "bun:test";
import { EphemeralAccountType, RampDirection } from "@vortexfi/shared";
import type { Transaction } from "sequelize";
import * as catalogNamespace from "../phases/blocks/flows/catalog";

const catalogReal = { ...catalogNamespace };
const register = mock(async (ctx: { metadata: unknown }) => ({
  metadata: { ...(ctx.metadata as object), refreshed: true },
  registrationFacts: { provider: { aveniaTicketId: "ticket-1", taxId: "derived-tax-id" } },
  responseArtifacts: { provider: { depositQrCode: "provider-code" } }
}));
const prepareTxs = mock(async () => ({
  stateMeta: { blockState: { provider: { taxId: "derived-tax-id" } }, phaseFlow: ["initial", "complete"] },
  unsignedTxs: []
}));
const start = mock(async (ctx: { metadata: unknown; state: unknown }) => ({
  metadata: { ...(ctx.metadata as object), started: true },
  responseArtifacts: { provider: { achPaymentData: { paymentType: "ACH", reference: "payment-1" } } },
  state: { ...(ctx.state as object), alfredpayTransactionId: "transaction-1" }
}));

mock.module("../phases/blocks/flows/catalog", () => ({
  ...catalogReal,
  resolvePersistedBlockFlow: () => ({ prepareTxs, register, start })
}));

const { RampService } = await import("./ramp.service");

afterAll(() => {
  mock.module("../phases/blocks/flows/catalog", () => ({ ...catalogReal }));
});

describe("RampService generic flow preparation", () => {
  it("dispatches through the persisted flow and maps refreshed metadata, facts, and artifacts", async () => {
    const transaction = {} as Transaction;
    const update = mock(async () => undefined);
    const metadata = {
      blocks: {},
      globals: {
        fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
        partner: null,
        request: { inputCurrency: "BRL", rampType: RampDirection.BUY }
      }
    };
    const quote = {
      get: () => ({ inputAmount: "100" }),
      inputCurrency: "BRL",
      metadata,
      outputCurrency: "BRLA",
      rampType: RampDirection.BUY,
      to: "base",
      update
    };

    const service = new RampService() as unknown as {
      prepareRampTransactions: (
        quote: never,
        signingAccounts: Array<{ address: string; type: EphemeralAccountType }>,
        additionalData: Record<string, string>,
        transaction: Transaction,
        userId: string
      ) => Promise<Record<string, unknown>>;
    };
    const result = await service.prepareRampTransactions(
      quote as never,
      [{ address: "0x1111111111111111111111111111111111111111", type: EphemeralAccountType.EVM }],
      { destinationAddress: "0x2222222222222222222222222222222222222222", taxId: "client-tax-id" },
      transaction,
      "user-1"
    );

    expect(register).toHaveBeenCalledWith(expect.objectContaining({
      authenticatedUser: { id: "user-1" },
      input: expect.objectContaining({ taxId: "client-tax-id" }),
      metadata,
      transaction
    }));
    expect(prepareTxs).toHaveBeenCalledWith(expect.objectContaining({
      destinationAddress: "0x2222222222222222222222222222222222222222",
      registrationFacts: { provider: { aveniaTicketId: "ticket-1", taxId: "derived-tax-id" } }
    }));
    expect(update).toHaveBeenCalledWith(
      { metadata: expect.objectContaining({ refreshed: true }) },
      { transaction }
    );
    expect(result).toEqual(expect.objectContaining({
      aveniaTicketId: "ticket-1",
      depositQrCode: "provider-code",
      stateMeta: expect.objectContaining({ aveniaTicketId: "ticket-1", taxId: "derived-tax-id" }),
      unsignedTxs: []
    }));
  });

  it("starts the persisted flow and transactionally maps metadata, state, and artifacts", async () => {
    const transaction = {} as Transaction;
    const quoteUpdate = mock(async () => undefined);
    const rampUpdate = mock(async () => undefined);
    const metadata = {
      blocks: {},
      globals: {
        fees: { usd: { anchor: "0", network: "0", partnerMarkup: "0", total: "0", vortex: "0" } },
        partner: null,
        request: { inputCurrency: "MXN", rampType: RampDirection.BUY }
      }
    };
    const quote = {
      get: () => ({ id: "quote-1", inputAmount: "100", inputCurrency: "MXN" }),
      metadata,
      update: quoteUpdate
    };
    const rampState = {
      state: { destinationAddress: "0x1111111111111111111111111111111111111111" },
      update: rampUpdate,
      userId: "user-1"
    };
    const service = new RampService() as unknown as {
      startPersistedFlow: (ramp: never, quote: never, transaction: Transaction) => Promise<Record<string, unknown>>;
    };

    const result = await service.startPersistedFlow(rampState as never, quote as never, transaction);

    expect(start).toHaveBeenCalledWith(expect.objectContaining({ metadata, state: rampState.state, userId: "user-1" }));
    expect(quoteUpdate).toHaveBeenCalledWith(
      { metadata: expect.objectContaining({ started: true }) },
      { transaction }
    );
    expect(rampUpdate).toHaveBeenCalledWith(
      { state: expect.objectContaining({ alfredpayTransactionId: "transaction-1" }) },
      { transaction }
    );
    expect(result).toEqual({ achPaymentData: { paymentType: "ACH", reference: "payment-1" } });
  });
});
