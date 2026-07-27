import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { FiatToken, RampDirection } from "@vortexfi/shared";
import { installFakeWorld, type FakeWorld } from "../test-utils/fake-world";
import { installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { setupTestDatabase, truncateAllTables } from "../test-utils/db";
import { createTestApiKey, createTestPartner, createTestQuote, createTestRampState, createTestUser } from "../test-utils/factories";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * HTTP-level auth and ownership invariants, derived from
 * docs/security-spec/01-auth and 03-ramp-engine. Every test drives the real
 * Express app against the real (test) database.
 */
describe("auth and ownership invariants", () => {
  let world: FakeWorld;
  let auth: { restore: () => void };
  let app: TestApp;

  const SIGNING_ACCOUNTS = [{ address: "0x30a300612ab372CC73e53ffE87fB73d62Ed68Da3", type: "EVM" }];

  const register = (body: object, headers: Record<string, string> = {}) =>
    app.request("/v1/ramp/register", {
      body: JSON.stringify(body),
      headers: { "Content-Type": "application/json", ...headers },
      method: "POST"
    });

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
    await truncateAllTables();
  });

  describe("POST /v1/ramp/register credential checks", () => {
    const body = { quoteId: crypto.randomUUID(), signingAccounts: SIGNING_ACCOUNTS };

    it("rejects requests without credentials", async () => {
      const response = await register(body);
      expect(response.status).toBe(401);
    });

    it("rejects an invalid bearer token", async () => {
      const response = await register(body, { Authorization: "Bearer not-a-real-token" });
      expect(response.status).toBe(401);
    });

    it("rejects a malformed API key", async () => {
      const response = await register(body, { "X-API-Key": "sk_garbage" });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("INVALID_SECRET_KEY");
    });

    it("rejects a well-formed but unknown API key", async () => {
      const response = await register(body, {
        "X-API-Key": "sk_test_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"
      });
      expect(response.status).toBe(401);
      const payload = (await response.json()) as { error: { code: string } };
      expect(payload.error.code).toBe("INVALID_API_KEY");
    });

    it("rejects a revoked API key", async () => {
      const user = await createTestUser();
      const { record, plaintextKey } = await createTestApiKey({ userId: user.id });
      await record.update({ isActive: false });

      const response = await register(body, { "X-API-Key": plaintextKey });
      expect(response.status).toBe(401);
    });

    it("rejects an expired API key", async () => {
      const user = await createTestUser();
      const { record, plaintextKey } = await createTestApiKey({ userId: user.id });
      await record.update({ expiresAt: new Date(Date.now() - 1000) });

      const response = await register(body, { "X-API-Key": plaintextKey });
      expect(response.status).toBe(401);
    });

    it("lets a valid user token past auth (404 for unknown quote, not 401)", async () => {
      const user = await createTestUser();
      const response = await register(body, { Authorization: `Bearer ${testUserToken(user.id)}` });
      expect(response.status).toBe(404);
    });

    it("lets a valid partner API key past auth (404 for unknown quote, not 401)", async () => {
      const user = await createTestUser();
      const { plaintextKey } = await createTestApiKey({ userId: user.id });
      const response = await register(body, { "X-API-Key": plaintextKey });
      expect(response.status).toBe(404);
    });
  });

  describe("GET /v1/ramp/:id ownership", () => {
    it("serves the owner and denies other users and anonymous callers", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const quote = await createTestQuote({ userId: owner.id });
      const ramp = await createTestRampState({ quoteId: quote.id, userId: owner.id });

      const asOwner = await app.request(`/v1/ramp/${ramp.id}`, {
        headers: { Authorization: `Bearer ${testUserToken(owner.id)}` }
      });
      expect(asOwner.status).toBe(200);

      const asStranger = await app.request(`/v1/ramp/${ramp.id}`, {
        headers: { Authorization: `Bearer ${testUserToken(stranger.id)}` }
      });
      expect(asStranger.status).toBe(403);

      const asAnonymous = await app.request(`/v1/ramp/${ramp.id}`);
      expect(asAnonymous.status).toBe(401);
    });

    it("serves fully anonymous ramps to anonymous callers", async () => {
      const quote = await createTestQuote();
      const ramp = await createTestRampState({ quoteId: quote.id });

      const response = await app.request(`/v1/ramp/${ramp.id}`);
      expect(response.status).toBe(200);
    });

    it("denies a partner key that does not own the ramp's quote", async () => {
      const owningPartner = await createTestPartner();
      const otherPartner = await createTestPartner();
      const { plaintextKey: otherKey } = await createTestApiKey({ partnerName: otherPartner.name });
      const { plaintextKey: owningKey } = await createTestApiKey({ partnerName: owningPartner.name });

      const quote = await createTestQuote({ partnerId: owningPartner.id });
      const ramp = await createTestRampState({ quoteId: quote.id });

      const asOther = await app.request(`/v1/ramp/${ramp.id}`, { headers: { "X-API-Key": otherKey } });
      expect(asOther.status).toBe(403);

      const asOwner = await app.request(`/v1/ramp/${ramp.id}`, { headers: { "X-API-Key": owningKey } });
      expect(asOwner.status).toBe(200);
    });
  });

  describe("quote lifecycle guards on registration", () => {
    it("rejects an expired quote", async () => {
      const user = await createTestUser();
      const quote = await createTestQuote({ expiresAt: new Date(Date.now() - 1000), userId: user.id });

      const response = await register(
        { quoteId: quote.id, signingAccounts: SIGNING_ACCOUNTS },
        { Authorization: `Bearer ${testUserToken(user.id)}` }
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("expired");
    });

    it("rejects an already-consumed quote", async () => {
      const user = await createTestUser();
      const quote = await createTestQuote({ status: "consumed", userId: user.id });

      const response = await register(
        { quoteId: quote.id, signingAccounts: SIGNING_ACCOUNTS },
        { Authorization: `Bearer ${testUserToken(user.id)}` }
      );
      expect(response.status).toBe(400);
      expect(await response.text()).toContain("consumed");
    });

    it("rejects registration by a user who does not own the quote", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const quote = await createTestQuote({ userId: owner.id });

      const response = await register(
        { quoteId: quote.id, signingAccounts: SIGNING_ACCOUNTS },
        { Authorization: `Bearer ${testUserToken(stranger.id)}` }
      );
      expect(response.status).toBe(403);
    });

    it("rejects EUR ramps while the EUR kill-switch is active", async () => {
      // Current production behavior (ramp.service.ts): EURC quotes cannot be
      // registered. Remove/adjust this test when EUR ramps are re-enabled.
      const user = await createTestUser();
      const quote = await createTestQuote({ inputCurrency: FiatToken.EURC, userId: user.id });

      const response = await register(
        { quoteId: quote.id, signingAccounts: SIGNING_ACCOUNTS },
        { Authorization: `Bearer ${testUserToken(user.id)}` }
      );
      expect(response.status).toBe(503);
    });

    it("rejects registration of a quote from the other flow variant", async () => {
      const user = await createTestUser();
      const quote = await createTestQuote({
        flowVariant: "monerium",
        inputCurrency: FiatToken.BRL,
        rampType: RampDirection.BUY,
        userId: user.id
      });

      const response = await register(
        { quoteId: quote.id, signingAccounts: SIGNING_ACCOUNTS },
        { Authorization: `Bearer ${testUserToken(user.id)}` }
      );
      expect(response.status).toBeGreaterThanOrEqual(400);
    });
  });

  describe("admin authentication", () => {
    it("guards partner API key admin routes with the admin secret", async () => {
      const partner = await createTestPartner();
      const path = `/v1/admin/partners/${partner.name}/api-keys`;

      const noAuth = await app.request(path);
      expect(noAuth.status).toBe(401);

      const wrongSecret = await app.request(path, { headers: { Authorization: "Bearer wrong-secret" } });
      expect(wrongSecret.status).toBe(403);

      const correctSecret = await app.request(path, { headers: { Authorization: "Bearer test-admin-secret" } });
      expect(correctSecret.status).toBe(200);
    });

    it("guards api-client-events with the metrics dashboard secret", async () => {
      const wrongSecret = await app.request("/v1/admin/api-client-events", {
        headers: { Authorization: "Bearer test-admin-secret" }
      });
      expect(wrongSecret.status).toBe(403);

      const correctSecret = await app.request("/v1/admin/api-client-events", {
        headers: { Authorization: "Bearer test-metrics-secret" }
      });
      expect(correctSecret.status).toBe(200);
    });
  });
});
