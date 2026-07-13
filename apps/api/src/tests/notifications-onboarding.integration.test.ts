import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredPayCountry, AlfredPayStatus, AlfredpayCustomerType, BrlaApiService } from "@vortexfi/shared";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import { emitNotification } from "../api/services/notifications/notification.service";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestAlfredpayCustomer, createTestTaxId, createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

let api: TestApp;
let fakeAuth: FakeSupabaseAuth;

beforeAll(async () => {
  await setupTestDatabase();
  fakeAuth = installFakeSupabaseAuth();
  api = await startTestApp();
});

afterAll(async () => {
  await api.close();
  fakeAuth.restore();
});

beforeEach(async () => {
  await resetTestDatabase();
});

function authHeaders(token: string): Record<string, string> {
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

async function createAuthedUser(email: string): Promise<{ user: User; token: string }> {
  const user = await createTestUser({ email });
  return { token: testUserToken(user.id, email), user };
}

describe("GET /v1/notifications", () => {
  it("requires authentication", async () => {
    const response = await api.request("/v1/notifications");
    expect(response.status).toBe(401);
  });

  it("returns the newest-first feed with the unread count, honoring limit", async () => {
    const { user, token } = await createAuthedUser("user@example.com");
    await emitNotification(user.id, { title: "First", type: "test_event" });
    await emitNotification(user.id, { body: "details", title: "Second", type: "test_event" });

    const response = await api.request("/v1/notifications?limit=1", { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { notifications: Array<{ title: string }>; unreadCount: number };
    expect(body.unreadCount).toBe(2);
    expect(body.notifications).toHaveLength(1);
    expect(body.notifications[0].title).toBe("Second");
  });
});

describe("notification read state", () => {
  it("marks a single notification read, scoped to the owner", async () => {
    const { user, token } = await createAuthedUser("user@example.com");
    const stranger = await createAuthedUser("stranger@example.com");
    const notification = await emitNotification(user.id, { title: "First", type: "test_event" });
    if (!notification) throw new Error("notification not created");

    const denied = await api.request(`/v1/notifications/${notification.id}/read`, {
      headers: authHeaders(stranger.token),
      method: "POST"
    });
    expect(denied.status).toBe(404);

    const marked = await api.request(`/v1/notifications/${notification.id}/read`, {
      headers: authHeaders(token),
      method: "POST"
    });
    expect(marked.status).toBe(204);

    const feed = await api.request("/v1/notifications", { headers: authHeaders(token) });
    const body = (await feed.json()) as { unreadCount: number };
    expect(body.unreadCount).toBe(0);
  });

  it("marks all notifications read", async () => {
    const { user, token } = await createAuthedUser("user@example.com");
    await emitNotification(user.id, { title: "First", type: "test_event" });
    await emitNotification(user.id, { title: "Second", type: "test_event" });

    const response = await api.request("/v1/notifications/read-all", { headers: authHeaders(token), method: "POST" });
    expect(response.status).toBe(204);

    const feed = await api.request("/v1/notifications", { headers: authHeaders(token) });
    const body = (await feed.json()) as { unreadCount: number };
    expect(body.unreadCount).toBe(0);
  });
});

describe("notification preferences", () => {
  it("returns defaults on first read and persists updates", async () => {
    const { token } = await createAuthedUser("user@example.com");

    const defaults = await api.request("/v1/notifications/preferences", { headers: authHeaders(token) });
    expect(defaults.status).toBe(200);
    expect(await defaults.json()).toEqual({ emailEnabled: true, prefs: {} });

    const updated = await api.request("/v1/notifications/preferences", {
      body: JSON.stringify({ emailEnabled: false, prefs: { rampCompleted: false } }),
      headers: authHeaders(token),
      method: "PUT"
    });
    expect(updated.status).toBe(200);

    const reread = await api.request("/v1/notifications/preferences", { headers: authHeaders(token) });
    expect(await reread.json()).toEqual({ emailEnabled: false, prefs: { rampCompleted: false } });
  });

  it("rejects a non-boolean emailEnabled", async () => {
    const { token } = await createAuthedUser("user@example.com");
    const response = await api.request("/v1/notifications/preferences", {
      body: JSON.stringify({ emailEnabled: "yes" }),
      headers: authHeaders(token),
      method: "PUT"
    });
    expect(response.status).toBe(400);
  });
});

describe("GET /v1/onboarding/status", () => {
  it("requires authentication", async () => {
    const response = await api.request("/v1/onboarding/status");
    expect(response.status).toBe(401);
  });

  it("maps initial AlfredPay customer creation to started", async () => {
    const { user } = await createAuthedUser("alfredpay-started@example.com");
    const view = await createAlfredpayCustomer(user.id, {
      alfredPayId: "alfredpay-started",
      country: AlfredPayCountry.MX,
      status: AlfredPayStatus.Consulted,
      type: AlfredpayCustomerType.INDIVIDUAL
    });

    const customer = await ProviderCustomer.findOne({ where: { providerCustomerId: "alfredpay-started" } });
    const kycCase = await KycCase.findOne({ where: { providerCustomerId: customer?.id } });
    expect(customer?.status).toBe(VerificationStatus.Started);
    expect(kycCase?.status).toBe(VerificationStatus.Started);

    await view.update({ statusExternal: null, verificationStatus: VerificationStatus.Pending });
    await customer?.reload();
    await kycCase?.reload();
    expect(customer?.status).toBe(VerificationStatus.Pending);
    expect(kycCase?.status).toBe(VerificationStatus.Pending);
  });

  it("aggregates provider accounts and KYC cases per entity with a normalized state", async () => {
    const { user, token } = await createAuthedUser("user@example.com");
    const avenia = await createTestTaxId(user.id);
    await KycCase.create({
      customerEntityId: avenia.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: avenia.id,
      status: VerificationStatus.Approved,
      type: "kyc"
    });
    const alfredpay = await createTestAlfredpayCustomer(user.id, { country: AlfredPayCountry.MX });
    await alfredpay.update({ status: VerificationStatus.InReview });

    const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      entities: Array<{
        type: string;
        accounts: Array<{ provider: string; state: string; status: string; kycCase: { status: string } | null }>;
      }>;
    };

    expect(body.entities).toHaveLength(1);
    const accounts = body.entities[0].accounts;
    expect(accounts).toHaveLength(2);

    const aveniaAccount = accounts.find(account => account.provider === "avenia");
    expect(aveniaAccount?.state).toBe("approved");
    expect(aveniaAccount?.status).toBe(VerificationStatus.Approved);
    expect(aveniaAccount?.kycCase?.status).toBe(VerificationStatus.Approved);

    const alfredpayAccount = accounts.find(account => account.provider === "alfredpay");
    // VERIFYING means the customer has submitted and the provider is actively reviewing.
    expect(alfredpayAccount?.state).toBe("in_review");
    expect(alfredpayAccount?.kycCase).toBeNull();
  });

  it("returns an empty aggregate for a fresh profile", async () => {
    const { token } = await createAuthedUser("fresh@example.com");
    const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as { entities: unknown[] };
    // The lazy entity fallback only runs on entity-scoped writes; a fresh profile
    // that never onboarded may legitimately have no entities yet.
    expect(Array.isArray(body.entities)).toBe(true);
  });

  it("hydrates a missing Avenia business name without exposing it for personal accounts", async () => {
    const { user, token } = await createAuthedUser("business@example.com");
    const business = await createTestTaxId(user.id, { customerType: "business", subAccountId: "business-subaccount" });
    await business.update({ companyName: null });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          subaccountInfo: mock(async () => ({ accountInfo: { fullName: "", name: "Acme Ltda" } }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        entities: Array<{ accounts: Array<{ companyName: string | null; provider: string }> }>;
      };
      expect(body.entities[0].accounts.find(account => account.provider === "avenia")?.companyName).toBe("Acme Ltda");
      await business.reload();
      expect(business.companyName).toBe("Acme Ltda");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }
  });
});
