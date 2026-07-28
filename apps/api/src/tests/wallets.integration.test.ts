import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { Transaction } from "sequelize";
import { config } from "../config/vars";
import { sequelize } from "../models";
import ProfileWallet from "../models/profileWallet.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestQuote, createTestRampState, createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

const WALLET_ADDRESS = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266";
const WALLET_ID = "wallet_privy_test_1";

let api: TestApp;
let fakeAuth: FakeSupabaseAuth;
const guardedFetch = globalThis.fetch;
const originalPrivyConfig = { ...config.privy };

function headers(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

function installPrivyResponse(address = WALLET_ADDRESS, walletId = WALLET_ID): void {
  globalThis.fetch = (async (input, init) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url === "https://api.privy.io/v1/users/custom_auth/id") {
      const body = JSON.parse(String(init?.body)) as { custom_user_id: string };
      return Response.json({
        id: `privy-user-${body.custom_user_id}`,
        linked_accounts: [
          {
            address,
            chain_type: "ethereum",
            id: walletId,
            type: "wallet",
            wallet_client_type: "privy"
          }
        ]
      });
    }
    return guardedFetch(input, init);
  }) as typeof globalThis.fetch;
}

beforeAll(async () => {
  await setupTestDatabase();
  fakeAuth = installFakeSupabaseAuth();
  api = await startTestApp();
});

afterAll(async () => {
  globalThis.fetch = guardedFetch;
  Object.assign(config.privy, originalPrivyConfig);
  if (api) await api.close();
  if (fakeAuth) fakeAuth.restore();
});

beforeEach(async () => {
  await resetTestDatabase();
  Object.assign(config.privy, {
    appId: "test-privy-app",
    appSecret: "test-privy-secret",
    walletRegistrationEnabled: true
  });
  installPrivyResponse();
});

describe("wallet API", () => {
  it("requires Supabase authentication", async () => {
    const response = await api.request("/v1/wallets");
    expect(response.status).toBe(401);
  });

  it("lists only the authenticated profile's wallet metadata", async () => {
    const first = await createTestUser({ email: "wallet-first@example.com" });
    const second = await createTestUser({ email: "wallet-second@example.com" });
    await ProfileWallet.create({
      address: WALLET_ADDRESS,
      profileId: first.id,
      providerWalletId: WALLET_ID
    });
    await ProfileWallet.create({
      address: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8",
      profileId: second.id,
      providerWalletId: "wallet_privy_test_2"
    });

    const response = await api.request("/v1/wallets", {
      headers: headers(testUserToken(first.id, first.email))
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { mode: null; wallets: Array<{ providerWalletId: string }> };
    expect(body.mode).toBeNull();
    expect(body.wallets.map(wallet => wallet.providerWalletId)).toEqual([WALLET_ID]);
  });

  it("rejects invalid modes and mode changes during a nonterminal ramp", async () => {
    const user = await createTestUser({ email: "wallet-mode@example.com" });
    const token = testUserToken(user.id, user.email);
    const invalid = await api.request("/v1/wallets/mode", {
      body: JSON.stringify({ mode: "automatic" }),
      headers: headers(token),
      method: "PATCH"
    });
    expect(invalid.status).toBe(400);

    const unverifiedEmbedded = await api.request("/v1/wallets/mode", {
      body: JSON.stringify({ mode: "privy_embedded" }),
      headers: headers(token),
      method: "PATCH"
    });
    expect(unverifiedEmbedded.status).toBe(409);
    expect(((await unverifiedEmbedded.json()) as { error: { code: string } }).error.code).toBe(
      "WALLET_NOT_REGISTERED"
    );

    await createTestRampState({ userId: user.id });
    const conflict = await api.request("/v1/wallets/mode", {
      body: JSON.stringify({ mode: "external" }),
      headers: headers(token),
      method: "PATCH"
    });
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_RAMP");
  });

  it("rechecks active ramps after waiting for a concurrent ramp registration", async () => {
    const user = await createTestUser({ email: "wallet-mode-race@example.com" });
    const quote = await createTestQuote({ userId: user.id });
    const rampTransaction = await sequelize.transaction();
    let transactionFinished = false;

    try {
      await User.findByPk(user.id, {
        lock: Transaction.LOCK.UPDATE,
        transaction: rampTransaction
      });
      await createTestRampState({ quoteId: quote.id, userId: user.id }, rampTransaction);

      const modeRequest = api.request("/v1/wallets/mode", {
        body: JSON.stringify({ mode: "external" }),
        headers: headers(testUserToken(user.id, user.email)),
        method: "PATCH"
      });

      await new Promise(resolve => setTimeout(resolve, 100));
      await rampTransaction.commit();
      transactionFinished = true;

      const response = await modeRequest;
      expect(response.status).toBe(409);
      expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_RAMP");
      await user.reload();
      expect(user.walletMode).toBeNull();
    } finally {
      if (!transactionFinished) {
        await rampTransaction.rollback();
      }
    }
  });

  it("verifies and idempotently registers a Privy wallet", async () => {
    const user = await createTestUser({ email: "wallet-register@example.com" });
    const token = testUserToken(user.id, user.email);
    const request = () =>
      api.request("/v1/wallets/privy", {
        body: JSON.stringify({ address: WALLET_ADDRESS, providerWalletId: WALLET_ID }),
        headers: headers(token),
        method: "POST"
      });

    const first = await request();
    const second = await request();
    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(await ProfileWallet.count({ where: { profileId: user.id } })).toBe(1);
    await user.reload();
    expect(user.walletMode).toBe("privy_embedded");
  });

  it("rejects a wallet already registered to another profile", async () => {
    const first = await createTestUser({ email: "wallet-owner@example.com" });
    const second = await createTestUser({ email: "wallet-stranger@example.com" });
    const register = (user: typeof first) =>
      api.request("/v1/wallets/privy", {
        body: JSON.stringify({ address: WALLET_ADDRESS, providerWalletId: WALLET_ID }),
        headers: headers(testUserToken(user.id, user.email)),
        method: "POST"
      });

    expect((await register(first)).status).toBe(200);
    const conflict = await register(second);
    expect(conflict.status).toBe(409);
    expect(((await conflict.json()) as { error: { code: string } }).error.code).toBe("WALLET_CONFLICT");
  });

  it("rejects mismatched Privy ownership without persisting metadata", async () => {
    const user = await createTestUser({ email: "wallet-mismatch@example.com" });
    installPrivyResponse("0x70997970C51812dc3A010C7d01b50e0d17dc79C8", "a-different-wallet");

    const response = await api.request("/v1/wallets/privy", {
      body: JSON.stringify({ address: WALLET_ADDRESS, providerWalletId: WALLET_ID }),
      headers: headers(testUserToken(user.id, user.email)),
      method: "POST"
    });

    expect(response.status).toBe(403);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe(
      "PRIVY_WALLET_NOT_VERIFIED"
    );
    expect(await ProfileWallet.count()).toBe(0);
  });

  it("atomically rolls back registration when a ramp is active", async () => {
    const user = await createTestUser({ email: "wallet-active-ramp@example.com" });
    await createTestRampState({ userId: user.id });

    const response = await api.request("/v1/wallets/privy", {
      body: JSON.stringify({ address: WALLET_ADDRESS, providerWalletId: WALLET_ID }),
      headers: headers(testUserToken(user.id, user.email)),
      method: "POST"
    });

    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_RAMP");
    expect(await ProfileWallet.count()).toBe(0);
    await user.reload();
    expect(user.walletMode).toBeNull();
  });

  it("fails closed when server-side Privy ownership verification is disabled", async () => {
    const user = await createTestUser({ email: "wallet-disabled@example.com" });
    config.privy.walletRegistrationEnabled = false;
    const response = await api.request("/v1/wallets/privy", {
      body: JSON.stringify({ address: WALLET_ADDRESS, providerWalletId: WALLET_ID }),
      headers: headers(testUserToken(user.id, user.email)),
      method: "POST"
    });
    expect(response.status).toBe(503);
    expect(await ProfileWallet.count()).toBe(0);
  });
});
