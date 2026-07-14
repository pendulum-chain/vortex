import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { EvmToken, FiatToken, Networks, RampDirection } from "@vortexfi/shared";
import QuoteTicket from "../models/quoteTicket.model";
import RampState from "../models/rampState.model";
import { installFakeWorld, type FakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestTaxId, createTestUser } from "../test-utils/factories";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * Quote consumption invariants (docs/security-spec/03-ramp-engine/
 * quote-lifecycle.md): a quote is consumed exactly once, atomically with ramp
 * registration. Exercised over the real HTTP API on the BRL→BRLA-on-Base
 * direct corridor — the full quote pipeline and registration flow run against
 * the fake external world.
 */
describe("quote consumption invariants (BRL onramp)", () => {
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

  async function createQuoteViaApi(): Promise<{ id: string; outputAmount: string; fee: unknown }> {
    const response = await app.request("/v1/quotes", {
      body: JSON.stringify({
        from: "pix",
        inputAmount: "100",
        inputCurrency: FiatToken.BRL,
        network: Networks.Base,
        outputCurrency: EvmToken.BRLA,
        rampType: RampDirection.BUY,
        to: Networks.Base
      }),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(201);
    return (await response.json()) as { id: string; outputAmount: string; fee: unknown };
  }

  async function registerViaApi(quoteId: string, userId: string): Promise<Response> {
    return app.request("/v1/ramp/register", {
      body: JSON.stringify({
        additionalData: { destinationAddress: DESTINATION, taxId: TAX_ID },
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

  it("serves a BRL onramp quote hermetically through the full quote pipeline", async () => {
    const quote = await createQuoteViaApi();
    expect(quote.id).toBeTruthy();
    expect(Number(quote.outputAmount)).toBeGreaterThan(0);

    const persisted = await QuoteTicket.findByPk(quote.id);
    expect(persisted?.status).toBe("pending");
    expect(persisted?.metadata.fees?.usd).toBeDefined();
    expect(persisted?.metadata.fees?.displayFiat).toBeDefined();
  });

  it("registers a ramp and consumes the quote exactly once", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();

    const response = await registerViaApi(quote.id, user.id);
    expect(response.status).toBe(201);

    const ramp = (await response.json()) as { id: string; unsignedTxs: Array<{ phase: string }> };
    expect(ramp.unsignedTxs.map(tx => tx.phase)).toContain("destinationTransfer");

    const consumedQuote = await QuoteTicket.findByPk(quote.id);
    expect(consumedQuote?.status).toBe("consumed");

    const rampState = await RampState.findByPk(ramp.id);
    expect(rampState?.quoteId).toBe(quote.id);
    expect(rampState?.state.depositQrCode).toBeTruthy();
  });

  it("allows exactly one of two concurrent registrations of the same quote", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();

    const [first, second] = await Promise.all([registerViaApi(quote.id, user.id), registerViaApi(quote.id, user.id)]);

    const statuses = [first.status, second.status].sort();
    expect(statuses[0]).toBe(201);
    expect(statuses[1]).toBeGreaterThanOrEqual(400);

    const ramps = await RampState.findAll({ where: { quoteId: quote.id } });
    expect(ramps.length).toBe(1);
  });

  it("allows only one active ramp per user across different quotes", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const firstQuote = await createQuoteViaApi();
    const secondQuote = await createQuoteViaApi();

    const [first, second] = await Promise.all([
      registerViaApi(firstQuote.id, user.id),
      registerViaApi(secondQuote.id, user.id)
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await RampState.count({ where: { userId: user.id } })).toBe(1);
  });

  it("releases an unstarted ramp after the start window expires", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const firstQuote = await createQuoteViaApi();
    const firstResponse = await registerViaApi(firstQuote.id, user.id);
    expect(firstResponse.status).toBe(201);
    const firstRamp = (await firstResponse.json()) as { id: string };

    await RampState.update(
      { createdAt: new Date(Date.now() - 16 * 60 * 1000) },
      { where: { id: firstRamp.id } }
    );

    const secondQuote = await createQuoteViaApi();
    const secondResponse = await registerViaApi(secondQuote.id, user.id);

    expect(secondResponse.status).toBe(201);
    expect((await RampState.findByPk(firstRamp.id))?.currentPhase).toBe("timedOut");
  });

  // Pins the atomic-UPDATE backstop directly: even if the registration flow's
  // row-locked pre-check were removed, consumeQuote must refuse a non-pending
  // quote at the database level (WHERE status = 'pending').
  it("consumeQuote reports zero affected rows for an already-consumed quote", async () => {
    const { BaseRampService } = await import("../api/services/ramp/base.service");
    class ConsumeQuoteProbe extends BaseRampService {
      public consume(id: string) {
        return this.consumeQuote(id);
      }
    }
    const probe = new ConsumeQuoteProbe();
    const quote = await createQuoteViaApi();

    const [firstAffected] = await probe.consume(quote.id);
    expect(firstAffected).toBe(1);

    const [secondAffected] = await probe.consume(quote.id);
    expect(secondAffected).toBe(0);
  });

  it("rejects a second registration after the quote is consumed", async () => {
    const user = await createTestUser();
    await createTestTaxId(user.id, { taxId: TAX_ID });
    const quote = await createQuoteViaApi();

    const first = await registerViaApi(quote.id, user.id);
    expect(first.status).toBe(201);

    const second = await registerViaApi(quote.id, user.id);
    expect(second.status).toBe(400);
    expect(await second.text()).toContain("consumed");
  });
});
