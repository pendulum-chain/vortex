import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import QuoteTicket from "../models/quoteTicket.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestTaxId, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const FEE_FIELDS = [
  "anchorFeeFiat",
  "anchorFeeUsd",
  "feeCurrency",
  "networkFeeFiat",
  "networkFeeUsd",
  "partnerFeeFiat",
  "partnerFeeUsd",
  "processingFeeFiat",
  "processingFeeUsd",
  "totalFeeFiat",
  "totalFeeUsd",
  "vortexFeeFiat",
  "vortexFeeUsd"
] as const;

/**
 * Fee immutability invariants (docs/security-spec/03-ramp-engine/
 * fee-integrity.md): fees are fixed at quote creation and no client-supplied
 * fee field is ever accepted — not on the quote request, not in registration
 * additionalData — and the status endpoint serves exactly the creation-time
 * fee structure.
 */
describe("fee immutability invariants (BRL onramp)", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let app: TestApp;

  const DESTINATION = "0x7ba99e99bc669b3508aff9cc0a898e869459f877";
  const EPHEMERAL = "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3";
  const TAX_ID = "12345678901";

  beforeAll(async () => {
    world = installFakeWorld();
    auth = installFakeSupabaseAuth();
    await setupTestDatabase();
    app = await startTestApp();
  });

  afterAll(async () => {
    await app?.close();
    auth?.restore();
    world?.restore();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function quoteBody(extra: Record<string, unknown> = {}): string {
    return JSON.stringify({
      from: "pix",
      inputAmount: "100",
      inputCurrency: FiatToken.BRL,
      network: Networks.Base,
      outputCurrency: EvmToken.BRLA,
      rampType: RampDirection.BUY,
      to: Networks.Base,
      ...extra
    });
  }

  async function createQuoteViaApi(extra: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const response = await app.request("/v1/quotes", {
      body: quoteBody(extra),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as Record<string, unknown>;
  }

  async function registerViaApi(
    quoteId: string,
    userId: string,
    additionalData: Record<string, unknown>
  ): Promise<Response> {
    return app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: DESTINATION, taxId: TAX_ID, ...additionalData },
        quoteId,
        signingAccounts: [{ address: EPHEMERAL, type: "EVM" }]
      }),
      headers: {
        Authorization: `Bearer ${testUserToken(userId)}`,
        "Content-Type": "application/json"
      },
      method: "POST"
    });
  }

  it("ignores client-supplied fee fields on quote creation", async () => {
    const clean = await createQuoteViaApi();
    const tampered = await createQuoteViaApi({
      anchorFeeFiat: "0",
      fee: { anchor: "0", displayFiat: { total: "0" }, total: "0", usd: { total: "0" } },
      metadata: { fees: { displayFiat: { total: "0" }, usd: { total: "0" } } },
      totalFeeFiat: "0",
      totalFeeUsd: "0"
    });

    for (const field of FEE_FIELDS) {
      expect(tampered[field], `quote field ${field} was influenced by the client`).toEqual(clean[field]);
    }
  });

  it("serves creation-time fees on the status endpoint, unchanged by registration additionalData", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });

    const quote = await createQuoteViaApi();
    const persistedAtCreation = await QuoteTicket.findByPk(quote.id as string);
    const feesAtCreation = JSON.stringify(persistedAtCreation?.metadata.fees);
    expect(persistedAtCreation?.metadata.fees).toBeDefined();

    // Registration with fee fields smuggled into additionalData must succeed
    // while leaving the persisted fee structure byte-identical.
    const registerResponse = await registerViaApi(quote.id as string, user.id, {
      anchorFeeFiat: "0",
      fees: { displayFiat: { total: "0" }, usd: { total: "0" } },
      totalFeeFiat: "0"
    });
    expect(registerResponse.status).toBe(201);
    const ramp = (await registerResponse.json()) as { id: string };

    const persistedAfterRegister = await QuoteTicket.findByPk(quote.id as string);
    expect(JSON.stringify(persistedAfterRegister?.metadata.fees)).toBe(feesAtCreation);

    const statusResponse = await app.request(`/v1/ramp/${ramp.id}`, {
      headers: { Authorization: `Bearer ${testUserToken(user.id)}` }
    });
    expect(statusResponse.status).toBe(200);
    const status = (await statusResponse.json()) as Record<string, unknown>;

    for (const field of FEE_FIELDS) {
      expect(status[field], `status fee field ${field} diverged from the quote`).toEqual(quote[field]);
    }

    // The persisted structure is still exactly the creation-time one.
    const persistedAfterStatus = await QuoteTicket.findByPk(quote.id as string);
    expect(JSON.stringify(persistedAfterStatus?.metadata.fees)).toBe(feesAtCreation);
  });
});
