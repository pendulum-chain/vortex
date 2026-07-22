import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { randomUUID } from "node:crypto";
import type { StateMetadata } from "../api/services/phases/meta-state-types";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestApiKey, createTestPartner, createTestQuote, createTestRampState, createTestUser } from "../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../test-utils/fake-world";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, TEST_OTP_CODE, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

/**
 * HTTP-level coverage for the route groups no other suite drives end to end:
 * the email/OTP auth flow, webhook registration/deletion, the ramp history
 * endpoint, and the public information routes. What these protect is the HTTP
 * contract — status codes, auth requirements, and response shapes.
 */
describe("HTTP surface: auth flow, webhooks, history, public routes", () => {
  let world: FakeWorld;
  let auth: FakeSupabaseAuth;
  let app: TestApp;

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

  async function requestJson(
    path: string,
    options: { method?: string; body?: unknown; headers?: Record<string, string> } = {}
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await app.request(path, {
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      headers: { "Content-Type": "application/json", ...options.headers },
      method: options.method ?? "GET"
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
  }

  describe("auth: email/OTP login flow", () => {
    it("walks check-email → request-otp → verify-otp and mints tokens accepted by authed endpoints", async () => {
      const email = "otp-user@example.com";

      // A fresh email is a signup...
      const fresh = await requestJson(`/v1/auth/check-email?email=${encodeURIComponent(email)}`);
      expect(fresh.status).toBe(200);
      expect(fresh.body).toEqual({ action: "signup", exists: false });

      const otp = await requestJson("/v1/auth/request-otp", { body: { email }, method: "POST" });
      expect(otp.status).toBe(200);
      expect(otp.body.success).toBe(true);
      expect(auth.otpRequests).toContain(email);

      // ...a wrong code is rejected without a session...
      const rejected = await requestJson("/v1/auth/verify-otp", { body: { email, token: "000000" }, method: "POST" });
      expect(rejected.status).toBe(400);
      expect(rejected.body.error).toContain("Invalid OTP");

      // ...and the right code returns tokens and syncs the local user row.
      const verified = await requestJson("/v1/auth/verify-otp", { body: { email, token: TEST_OTP_CODE }, method: "POST" });
      expect(verified.status).toBe(200);
      expect(verified.body.success).toBe(true);
      expect(verified.body.access_token).toBeTruthy();
      expect(verified.body.refresh_token).toBeTruthy();
      const userId = verified.body.user_id as string;
      expect(await User.findByPk(userId)).not.toBeNull();

      const known = await requestJson(`/v1/auth/check-email?email=${encodeURIComponent(email)}`);
      expect(known.body).toEqual({ action: "signin", exists: true });

      // The minted access token is a real session: verify accepts it and an
      // auth-guarded endpoint (ramp history) serves the user's (empty) history.
      const verify = await requestJson("/v1/auth/verify", {
        body: { access_token: verified.body.access_token },
        method: "POST"
      });
      expect(verify.status).toBe(200);
      expect(verify.body).toEqual({ user_id: userId, valid: true });

      const history = await requestJson("/v1/ramp/history/0x1111111111111111111111111111111111111111", {
        headers: { Authorization: `Bearer ${verified.body.access_token}` }
      });
      expect(history.status).toBe(200);
      expect(history.body).toEqual({ totalCount: 0, transactions: [] });
    });

    it("refresh rotates a valid session and rejects a garbage refresh token with 401", async () => {
      const email = "refresh-user@example.com";
      await requestJson("/v1/auth/request-otp", { body: { email }, method: "POST" });
      const verified = await requestJson("/v1/auth/verify-otp", { body: { email, token: TEST_OTP_CODE }, method: "POST" });

      const refreshed = await requestJson("/v1/auth/refresh", {
        body: { refresh_token: verified.body.refresh_token },
        method: "POST"
      });
      expect(refreshed.status).toBe(200);
      expect(refreshed.body.success).toBe(true);
      expect(refreshed.body.access_token).toBeTruthy();

      const rejected = await requestJson("/v1/auth/refresh", { body: { refresh_token: "garbage" }, method: "POST" });
      expect(rejected.status).toBe(401);
    });

    it("verify requires a token and rejects invalid ones", async () => {
      const missing = await requestJson("/v1/auth/verify", { body: {}, method: "POST" });
      expect(missing.status).toBe(400);

      const invalid = await requestJson("/v1/auth/verify", { body: { access_token: "not-a-token" }, method: "POST" });
      expect(invalid.status).toBe(401);
      expect(invalid.body.valid).toBe(false);
    });
  });

  describe("webhooks", () => {
    async function apiKeyHeaders(): Promise<Record<string, string>> {
      const user = await createTestUser();
      const { plaintextKey } = await createTestApiKey({ userId: user.id });
      return { "x-api-key": plaintextKey };
    }

    it("registration requires an API key", async () => {
      const quote = await createTestQuote();
      const response = await requestJson("/v1/webhook", {
        body: { quoteId: quote.id, url: "https://partner.example/hook" },
        method: "POST"
      });
      expect(response.status).toBe(401);
    });

    it("registers a webhook for a quote and deletes it exactly once", async () => {
      const headers = await apiKeyHeaders();
      const quote = await createTestQuote();

      const created = await requestJson("/v1/webhook", {
        body: { quoteId: quote.id, url: "https://partner.example/hook" },
        headers,
        method: "POST"
      });
      expect(created.status).toBe(201);
      expect(created.body.id).toBeTruthy();
      expect(created.body.url).toBe("https://partner.example/hook");
      expect(created.body.quoteId).toBe(quote.id);
      expect(created.body.isActive).toBe(true);

      const deleted = await requestJson(`/v1/webhook/${created.body.id}`, { headers, method: "DELETE" });
      expect(deleted.status).toBe(200);
      expect(deleted.body.success).toBe(true);

      const again = await requestJson(`/v1/webhook/${created.body.id}`, { headers, method: "DELETE" });
      expect(again.status).toBe(404);
    });

    it("rejects non-HTTPS URLs, unknown quotes, and registrations without a quote or session", async () => {
      const headers = await apiKeyHeaders();
      const quote = await createTestQuote();

      const insecure = await requestJson("/v1/webhook", {
        body: { quoteId: quote.id, url: "http://partner.example/hook" },
        headers,
        method: "POST"
      });
      expect(insecure.status).toBe(400);

      const unknownQuote = await requestJson("/v1/webhook", {
        body: { quoteId: randomUUID(), url: "https://partner.example/hook" },
        headers,
        method: "POST"
      });
      expect(unknownQuote.status).toBe(404);

      const noTarget = await requestJson("/v1/webhook", {
        body: { url: "https://partner.example/hook" },
        headers,
        method: "POST"
      });
      expect(noTarget.status).toBe(400);
    });
  });

  describe("ramp history", () => {
    const WALLET = "0x2222222222222222222222222222222222222222";

    it("serves only the caller's own non-initial ramps for the wallet", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const quote = await createTestQuote();
      await createTestRampState({
        currentPhase: "complete",
        quoteId: quote.id,
        state: { destinationAddress: WALLET } as StateMetadata,
        userId: owner.id
      });
      // An initial-phase ramp must not appear in history.
      await createTestRampState({
        currentPhase: "initial",
        quoteId: (await createTestQuote()).id,
        state: { destinationAddress: WALLET } as StateMetadata,
        userId: owner.id
      });

      const ownHistory = await requestJson(`/v1/ramp/history/${WALLET}`, {
        headers: { Authorization: `Bearer ${testUserToken(owner.id)}` }
      });
      expect(ownHistory.status).toBe(200);
      expect(ownHistory.body.totalCount).toBe(1);
      const transactions = ownHistory.body.transactions as Array<{ id: string; status: string }>;
      expect(transactions).toHaveLength(1);

      // Another user sees nothing for the same wallet (F-068 class).
      const foreignHistory = await requestJson(`/v1/ramp/history/${WALLET}`, {
        headers: { Authorization: `Bearer ${testUserToken(stranger.id)}` }
      });
      expect(foreignHistory.status).toBe(200);
      expect(foreignHistory.body).toEqual({ totalCount: 0, transactions: [] });
    });

    it("requires authentication", async () => {
      const response = await requestJson(`/v1/ramp/history/${WALLET}`);
      expect(response.status).toBe(401);
    });

    it("serves all non-initial ramps owned by the authenticated user without a wallet filter", async () => {
      const owner = await createTestUser();
      const stranger = await createTestUser();
      const firstWallet = "0x3333333333333333333333333333333333333333";
      const secondWallet = "0x4444444444444444444444444444444444444444";

      const first = await createTestRampState({
        currentPhase: "complete",
        quoteId: (await createTestQuote()).id,
        state: { destinationAddress: firstWallet } as StateMetadata,
        userId: owner.id
      });
      const second = await createTestRampState({
        currentPhase: "complete",
        quoteId: (await createTestQuote()).id,
        state: { destinationAddress: secondWallet } as StateMetadata,
        userId: owner.id
      });
      await createTestRampState({
        currentPhase: "complete",
        quoteId: (await createTestQuote()).id,
        state: { destinationAddress: firstWallet } as StateMetadata,
        userId: stranger.id
      });

      const history = await requestJson("/v1/ramp/history", {
        headers: { Authorization: `Bearer ${testUserToken(owner.id)}` }
      });
      expect(history.status).toBe(200);
      expect(history.body.totalCount).toBe(2);
      const transactions = history.body.transactions as Array<{ id: string; walletAddress: string }>;
      expect(new Set(transactions.map(transaction => transaction.id))).toEqual(new Set([first.id, second.id]));
      expect(new Set(transactions.map(transaction => transaction.walletAddress))).toEqual(
        new Set([firstWallet, secondWallet])
      );
    });

    it("accepts a user-scoped API key and rejects anonymous all-user history", async () => {
      const owner = await createTestUser();
      const { plaintextKey } = await createTestApiKey({ userId: owner.id });

      const authenticated = await requestJson("/v1/ramp/history", { headers: { "x-api-key": plaintextKey } });
      expect(authenticated.status).toBe(200);
      expect(authenticated.body).toEqual({ totalCount: 0, transactions: [] });

      const anonymous = await requestJson("/v1/ramp/history");
      expect(anonymous.status).toBe(401);
    });

    it("rejects a partner-only secret key instead of falling back to partner-wide history", async () => {
      const partner = await createTestPartner();
      const { plaintextKey } = await createTestApiKey({ partnerName: partner.name });

      const response = await requestJson("/v1/ramp/history", { headers: { "x-api-key": plaintextKey } });
      expect(response.status).toBe(403);
    });

    it("validates history pagination", async () => {
      const owner = await createTestUser();
      const response = await requestJson("/v1/ramp/history?limit=10x&offset=-1", {
        headers: { Authorization: `Bearer ${testUserToken(owner.id)}` }
      });
      expect(response.status).toBe(400);
    });
  });

  describe("public information routes", () => {
    it("serves the supported fiat currencies, cryptocurrencies, countries, and payment methods", async () => {
      const fiat = await requestJson("/v1/supported-fiat-currencies");
      expect(fiat.status).toBe(200);
      const currencies = fiat.body.currencies as Array<{ symbol: string }>;
      // Token exhaustiveness (see CLAUDE.md): all six fiat tokens stay listed.
      // (FiatToken.EURC's wire value is "EUR".)
      expect(currencies.map(currency => currency.symbol).sort()).toEqual(["ARS", "BRL", "COP", "EUR", "MXN", "USD"]);

      const crypto = await requestJson("/v1/supported-cryptocurrencies");
      expect(crypto.status).toBe(200);

      const countries = await requestJson("/v1/supported-countries");
      expect(countries.status).toBe(200);

      const methods = await requestJson("/v1/supported-payment-methods");
      expect(methods.status).toBe(200);
      const sellMethods = methods.body.paymentMethods as Array<{ id: string; supportedFiats: Array<{ id: string }> }>;
      expect(sellMethods.map(method => method.id).sort()).toEqual(["ach", "cbu", "pix", "sepa", "spei"]);
      // Every fiat token is reachable through at least one sell payment method.
      const sellFiats = sellMethods.flatMap(method => method.supportedFiats.map(fiat => fiat.id));
      expect([...new Set(sellFiats)].sort()).toEqual(["ARS", "BRL", "COP", "EUR", "MXN", "USD"]);

      const buyMethods = await requestJson("/v1/supported-payment-methods?type=buy");
      expect(buyMethods.status).toBe(200);
      const buyIds = (buyMethods.body.paymentMethods as Array<{ id: string }>).map(method => method.id);
      expect(buyIds.sort()).toEqual(["ach", "pix", "spei"]);

      const mxnMethods = await requestJson("/v1/supported-payment-methods?fiat=MXN");
      expect(mxnMethods.status).toBe(200);
      expect((mxnMethods.body.paymentMethods as Array<{ id: string }>).map(method => method.id)).toEqual(["spei"]);
    });

    it("price endpoints validate their query parameters", async () => {
      const missingEverything = await requestJson("/v1/prices");
      expect(missingEverything.status).toBe(400);

      const missingAmount = await requestJson("/v1/prices/all?direction=onramp&sourceCurrency=eur&targetCurrency=usdc&network=base");
      expect(missingAmount.status).toBe(400);
    });
  });
});
