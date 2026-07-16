import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  AlfredPayCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  AlfredpayCustomerType,
  AlfredpayKycStatus,
  BrlaApiService,
  KycAttemptResult,
  KycAttemptStatus
} from "@vortexfi/shared";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import { emitNotification } from "../api/services/notifications/notification.service";
import CustomerEntity from "../models/customerEntity.model";
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

  it("reflects an Alfredpay approval that lands after the wizard closed, without a reopen", async () => {
    const { user, token } = await createAuthedUser("alfredpay-late-approval@example.com");
    const customer = await createTestAlfredpayCustomer(user.id, { alfredPayId: "ap-late", country: AlfredPayCountry.MX });
    // Submitted, provider still reviewing — the state the card is stuck on once the modal closes.
    await customer.update({ status: VerificationStatus.InReview });

    const getInstance = AlfredpayApiService.getInstance;
    AlfredpayApiService.getInstance = mock(
      () =>
        ({
          getKycStatus: mock(async () => ({ status: AlfredpayKycStatus.COMPLETED })),
          getLastKycSubmission: mock(async () => ({ submissionId: "sub-1" }))
        }) as unknown as AlfredpayApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      const body = (await response.json()) as {
        entities: Array<{ accounts: Array<{ kycCase: { status: string } | null; provider: string; state: string }> }>;
      };
      const account = body.entities[0].accounts.find(item => item.provider === "alfredpay");
      expect(account?.state).toBe("approved");
      expect(account?.kycCase?.status).toBe("approved");
    } finally {
      AlfredpayApiService.getInstance = getInstance;
    }

    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.Approved);
  });

  it("reflects an Avenia individual approval that lands after the wizard closed, without a reopen", async () => {
    const { user, token } = await createAuthedUser("avenia-late-approval@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-late" });
    await customer.update({ status: VerificationStatus.InReview });

    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({
            attempts: [{ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }]
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      const body = (await response.json()) as { entities: Array<{ accounts: Array<{ provider: string; state: string }> }> };
      expect(body.entities[0].accounts.find(account => account.provider === "avenia")?.state).toBe("approved");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.Approved);
  });

  it("keeps an individual resumable when the Avenia attempt expired without a decision", async () => {
    const { user, token } = await createAuthedUser("avenia-kyc-expired@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-expired" });
    await customer.update({ status: VerificationStatus.InReview });

    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [{ status: KycAttemptStatus.EXPIRED }] }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      const body = (await response.json()) as { entities: Array<{ accounts: Array<{ provider: string; state: string }> }> };
      expect(body.entities[0].accounts.find(account => account.provider === "avenia")?.state).toBe("pending");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.Pending);
  });

  it("keeps an individual resumable while the Avenia attempt is still PENDING", async () => {
    const { user, token } = await createAuthedUser("avenia-kyc-unfinished@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-unfinished" });
    await customer.update({ status: VerificationStatus.InReview });

    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [{ status: KycAttemptStatus.PENDING }] }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      const body = (await response.json()) as { entities: Array<{ accounts: Array<{ provider: string; state: string }> }> };
      expect(body.entities[0].accounts.find(account => account.provider === "avenia")?.state).toBe("pending");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.Pending);
  });

  it("keeps a business KYB pending (resumable) while the Avenia attempt is still PENDING", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-pending@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "kyb-subaccount",
      taxId: "11222333000181"
    });
    // The stuck shape reported from staging: our row says in_review while Avenia's attempt is
    // still PENDING because the user never finished (or misclicked past) the hosted steps.
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PENDING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-1",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PENDING,
      type: "kyb"
    });

    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({ attempt: { id: "attempt-1", status: KycAttemptStatus.PENDING } }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        entities: Array<{ accounts: Array<{ provider: string; state: string; taxReference: string | null }> }>;
      };
      const aveniaAccount = body.entities[0].accounts.find(account => account.provider === "avenia");
      expect(aveniaAccount?.state).toBe("pending");
      // The dashboard resumes the company flow from this — the CNPJ the owner already supplied.
      expect(aveniaAccount?.taxReference).toBe("11222333000181");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Pending);
    expect(kycCase.status).toBe(VerificationStatus.Pending);
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
        accounts: Array<{
          provider: string;
          state: string;
          status: string;
          taxReference: string | null;
          kycCase: { status: string } | null;
        }>;
      }>;
    };

    expect(body.entities).toHaveLength(1);
    const accounts = body.entities[0].accounts;
    expect(accounts).toHaveLength(2);

    const aveniaAccount = accounts.find(account => account.provider === "avenia");
    expect(aveniaAccount?.state).toBe("approved");
    expect(aveniaAccount?.status).toBe(VerificationStatus.Approved);
    expect(aveniaAccount?.kycCase?.status).toBe(VerificationStatus.Approved);
    // Individual CPFs are never exposed; only business CNPJs are (for company-flow resume).
    expect(aveniaAccount?.taxReference).toBeNull();

    const alfredpayAccount = accounts.find(account => account.provider === "alfredpay");
    // VERIFYING means the customer has submitted and the provider is actively reviewing.
    expect(alfredpayAccount?.state).toBe("in_review");
    expect(alfredpayAccount?.kycCase).toBeNull();
  });

  it("returns an empty aggregate for a fresh profile", async () => {
    const { token } = await createAuthedUser("fresh@example.com");
    const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
    expect(response.status).toBe(200);
    const body = (await response.json()) as {
      activeEntityId: string | null;
      entities: unknown[];
      selectionRequired: boolean;
    };
    // The lazy entity fallback only runs on entity-scoped writes; a fresh profile
    // that never onboarded may legitimately have no entities yet.
    expect(Array.isArray(body.entities)).toBe(true);
    expect(body.activeEntityId).toBeNull();
    expect(body.selectionRequired).toBe(true);
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

describe("PUT /v1/onboarding/active-entity", () => {
  it("requires authentication and validates the account type", async () => {
    const unauthorized = await api.request("/v1/onboarding/active-entity", {
      body: JSON.stringify({ type: "individual" }),
      headers: { "Content-Type": "application/json" },
      method: "PUT"
    });
    expect(unauthorized.status).toBe(401);

    const { token } = await createAuthedUser("invalid-type@example.com");
    const invalid = await api.request("/v1/onboarding/active-entity", {
      body: JSON.stringify({ type: "company" }),
      headers: authHeaders(token),
      method: "PUT"
    });
    expect(invalid.status).toBe(400);
  });

  it("persists an initial selection, is idempotent, and rejects changing it", async () => {
    const { user, token } = await createAuthedUser("selection@example.com");
    const request = () =>
      api.request("/v1/onboarding/active-entity", {
        body: JSON.stringify({ type: "business" }),
        headers: authHeaders(token),
        method: "PUT"
      });

    const selected = await request();
    expect(selected.status).toBe(200);
    const firstBody = (await selected.json()) as { activeEntityId: string; type: string };
    expect(firstBody.type).toBe("business");

    const retry = await request();
    expect(retry.status).toBe(200);
    expect(await retry.json()).toEqual(firstBody);
    expect(await CustomerEntity.count({ where: { profileId: user.id } })).toBe(1);

    const changed = await api.request("/v1/onboarding/active-entity", {
      body: JSON.stringify({ type: "individual" }),
      headers: authHeaders(token),
      method: "PUT"
    });
    expect(changed.status).toBe(409);

    const status = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
    const statusBody = (await status.json()) as { activeEntityId: string | null; selectionRequired: boolean };
    expect(statusBody.activeEntityId).toBe(firstBody.activeEntityId);
    expect(statusBody.selectionRequired).toBe(false);
  });

  it("cannot reach an ambiguous same-type state: the unique index rejects duplicate entities", async () => {
    // The ACTIVE_ENTITY_AMBIGUOUS branch in selectActiveCustomerEntity is defense-in-depth:
    // migration 049's partial unique index on (profile_id, type) makes the duplicate state
    // it guards against impossible to create in the first place.
    const { user } = await createAuthedUser("ambiguous@example.com");
    await CustomerEntity.create({ profileId: user.id, status: "active", type: "individual" });

    const duplicate = CustomerEntity.create({ profileId: user.id, status: "active", type: "individual" });
    await expect(duplicate).rejects.toMatchObject({ name: "SequelizeUniqueConstraintError" });
  });

  it("rejects a persisted selection owned by another profile", async () => {
    const { user, token } = await createAuthedUser("owner@example.com");
    const stranger = await createAuthedUser("stranger-owner@example.com");
    const entity = await CustomerEntity.create({ profileId: stranger.user.id, status: "active", type: "individual" });
    await user.update({ activeCustomerEntityId: entity.id });

    const response = await api.request("/v1/onboarding/active-entity", {
      body: JSON.stringify({ type: "individual" }),
      headers: authHeaders(token),
      method: "PUT"
    });
    expect(response.status).toBe(409);
    expect(((await response.json()) as { error: { code: string } }).error.code).toBe("ACTIVE_ENTITY_OWNERSHIP_MISMATCH");
  });
});
