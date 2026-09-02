import { afterAll, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import {
  DomesticCountry,
  AlfredPayStatus,
  AlfredpayApiService,
  DomesticCustomerType,
  AlfredpayKycStatus,
  BrlaApiService,
  KycAttemptResult,
  KycAttemptStatus
} from "@vortexfi/shared";
import { createAlfredpayCustomer } from "../api/services/alfredpay/alfredpay-customer.service";
import { enqueueVerificationNotification } from "../api/services/avenia/verification-notifications";
import { reconcileMissedRampCompletedEmails } from "../api/services/email";
import { emitNotification } from "../api/services/notifications/notification.service";
import KybStatusWorker from "../api/workers/kyb-status.worker";
import logger from "../config/logger";
import ApiCredential from "../models/apiCredential.model";
import CustomerEntity from "../models/customerEntity.model";
import EmailNotification, { NotificationProvider, NotificationStatus, NotificationType } from "../models/emailNotification.model";
import KycCase from "../models/kycCase.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import {
  createTestAlfredpayCustomer,
  createTestQuote,
  createTestRampState,
  createTestTaxId,
  createTestUser
} from "../test-utils/factories";
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

describe("ramp completion notification reconciliation", () => {
  it("re-enqueues exactly the completed ramps that have no notification row", async () => {
    const { user } = await createAuthedUser("reconcile@example.com");
    const missed = await createTestRampState({ currentPhase: "complete", userId: user.id });
    const already = await createTestRampState({ currentPhase: "complete", userId: user.id });
    await EmailNotification.create({
      locale: "en-US",
      provider: NotificationProvider.Vortex,
      resourceId: already.id,
      status: NotificationStatus.Sent,
      type: NotificationType.RampCompleted,
      userId: user.id
    });
    await createTestRampState({ currentPhase: "nablaSwap", userId: user.id });
    await createTestRampState({ currentPhase: "complete", userId: null });

    await reconcileMissedRampCompletedEmails();

    const missedRow = await EmailNotification.findOne({ where: { resourceId: missed.id } });
    expect(missedRow?.status).toBe(NotificationStatus.Pending);
    expect(missedRow?.userId).toBe(user.id);
    expect(await EmailNotification.count()).toBe(2);

    // A second sweep must be a no-op: the freshly written row now satisfies the anti-join.
    await reconcileMissedRampCompletedEmails();
    expect(await EmailNotification.count()).toBe(2);
  });

  it("polls only undecided KYB cases whose attempt has no queued outcome", async () => {
    const fresh = await createAuthedUser("kyb-poll-fresh@example.com");
    const freshBusiness = await createTestTaxId(fresh.user.id, {
      customerType: "business",
      subAccountId: "kyb-poll-fresh-sub",
      taxId: "11222333000181"
    });
    await KycCase.create({
      customerEntityId: freshBusiness.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-fresh",
      providerCustomerId: freshBusiness.id,
      status: VerificationStatus.InReview,
      type: "kyb"
    });

    // Partner-owned: an entity with no profile has nobody to email and must not
    // occupy a batch slot (the worker filters it in the join). Give it a fully bound
    // business account so the missing profile — not the provider-customer join — is
    // provably what excludes it.
    const partnerEntity = await CustomerEntity.create({ profileId: null, status: "active", type: "business" });
    const partnerBusiness = await ProviderCustomer.create({
      customerEntityId: partnerEntity.id,
      customerType: "business",
      provider: "avenia",
      providerSubaccountId: "kyb-poll-partner-sub",
      status: VerificationStatus.InReview
    });
    await KycCase.create({
      customerEntityId: partnerEntity.id,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-partner",
      providerCustomerId: partnerBusiness.id,
      status: VerificationStatus.InReview,
      type: "kyb"
    });

    const settled = await createAuthedUser("kyb-poll-settled@example.com");
    const settledBusiness = await createTestTaxId(settled.user.id, {
      customerType: "business",
      subAccountId: "kyb-poll-settled-sub",
      taxId: "22333444000162"
    });
    await KycCase.create({
      customerEntityId: settledBusiness.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-settled",
      providerCustomerId: settledBusiness.id,
      status: VerificationStatus.InReview,
      type: "kyb"
    });
    await EmailNotification.create({
      locale: "en-US",
      provider: NotificationProvider.Avenia,
      resourceId: "attempt-settled",
      status: NotificationStatus.Sent,
      type: NotificationType.VerificationApproved,
      userId: settled.user.id
    });

    const polled: Array<[string, string]> = [];
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async (attemptId: string, subAccountId: string) => {
            polled.push([attemptId, subAccountId]);
            return { attempt: { id: attemptId, status: KycAttemptStatus.PENDING, updatedAt: "2026-08-06" } };
          })
        }) as unknown as BrlaApiService
    );

    try {
      const worker = new KybStatusWorker() as unknown as { poll: () => Promise<void> };
      await worker.poll();
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(polled).toEqual([["attempt-fresh", "kyb-poll-fresh-sub"]]);
  });

  it("tombstones a completed partner-API ramp instead of enqueuing mail", async () => {
    const { user } = await createAuthedUser("partner-ramp@example.com");
    const credential = await ApiCredential.create({
      environment: "live",
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      name: "partner credential",
      partnerId: null,
      profileId: user.id,
      publicKeyValue: "pk_test_reconcile",
      secretKeyDigest: "a".repeat(64),
      secretKeyPrefix: "sk_test_12345678"
    });
    const quote = await createTestQuote({ apiCredentialId: credential.id, userId: user.id });
    const ramp = await createTestRampState({ currentPhase: "complete", quoteId: quote.id, userId: user.id });

    await reconcileMissedRampCompletedEmails();

    const rows = await EmailNotification.findAll({ where: { resourceId: ramp.id } });
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe(NotificationStatus.Skipped);
    expect(rows[0].lastError).toContain("Partner-API ramp");
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
      country: DomesticCountry.MX,
      status: AlfredPayStatus.Consulted,
      type: DomesticCustomerType.INDIVIDUAL
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
    const customer = await createTestAlfredpayCustomer(user.id, { alfredPayId: "ap-late", country: DomesticCountry.MX });
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
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });

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
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });

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
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });

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

  it("does not persist a completed individual attempt without a result", async () => {
    const { user, token } = await createAuthedUser("avenia-kyc-completed-no-result@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-completed-no-result" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: "standard"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts: mock(async () => ({ attempts: [{ status: KycAttemptStatus.COMPLETED }] }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
    expect(kycCase.status).toBe(VerificationStatus.InReview);
    expect(kycCase.statusExternal).toBe("UNCHANGED");
  });

  it("polls an individual case by its exact current attempt id", async () => {
    const { user, token } = await createAuthedUser("avenia-kyc-exact@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-exact" });
    await customer.update({ status: VerificationStatus.InReview });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-exact",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });
    const getVerificationAttemptStatus = mock(async () => ({
      attempt: { id: "attempt-exact", status: KycAttemptStatus.PROCESSING }
    }));
    const getKycAttempts = mock(async () => ({ attempts: [] }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () => ({ getKycAttempts, getVerificationAttemptStatus }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(getVerificationAttemptStatus).toHaveBeenCalledWith("attempt-exact", "sub-exact");
    expect(getKycAttempts).not.toHaveBeenCalled();
    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(kycCase.statusExternal).toBe(KycAttemptStatus.PROCESSING);
  });

  it("does not fall back to attempt lists for an imported case with no attempt id", async () => {
    const { user, token } = await createAuthedUser("avenia-import-no-id@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-import-no-id" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: "sumsub_share_token"
    });
    const getKycAttempts = mock(async () => ({
      attempts: [{ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }]
    }));
    const getVerificationAttemptStatus = mock(async () => ({
      attempt: { id: "unbound", result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () => ({ getKycAttempts, getVerificationAttemptStatus }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(getKycAttempts).not.toHaveBeenCalled();
    expect(getVerificationAttemptStatus).not.toHaveBeenCalled();
    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
  });

  it("skips an unbound active standard submission instead of applying the latest provider attempt", async () => {
    const { user, token } = await createAuthedUser("avenia-standard-reconciliation@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-standard-reconciliation" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: "standard",
      verificationSubmission: {
        actorProfileId: user.id,
        attemptBaselineIds: [],
        payloadFingerprint: "test-payload-fingerprint",
        status: "submitted",
        subjectProfileId: user.id
      }
    });
    const getKycAttempts = mock(async () => ({
      attempts: [{ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }]
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(() => ({ getKycAttempts }) as unknown as BrlaApiService);

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(getKycAttempts).not.toHaveBeenCalled();
    await customer.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
  });

  it("locks a nullable case to standard before interpreting provider history", async () => {
    const { user, token } = await createAuthedUser("avenia-legacy-import@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-legacy-import" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: null
    });
    const getVerificationAttemptStatus = mock(async () => ({
      attempt: { id: "legacy-import", result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }
    }));
    const getKycAttempts = mock(async () => ({ attempts: [{ id: "legacy-import", levelName: "sumsub-token-recipient" }] }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts,
          getUploadedDocuments: mock(async () => ({ documents: [] })),
          getVerificationAttemptStatus
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(getVerificationAttemptStatus).not.toHaveBeenCalled();
    expect(getKycAttempts).toHaveBeenCalledTimes(1);
    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
    expect(kycCase.verificationMethod).toBe("standard");
    expect(kycCase.providerCaseId).toBeNull();
  });

  it("does not use mixed Avenia history to infer a token-import method", async () => {
    const { user, token } = await createAuthedUser("avenia-legacy-mixed@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-legacy-mixed" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: null
    });
    const getKycAttempts = mock(async () => ({
      attempts: [{ levelName: "level-1" }, { levelName: "sumsub-token-recipient" }]
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKycAttempts,
          getUploadedDocuments: mock(async () => ({ documents: [] }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
    expect(kycCase.verificationMethod).toBe("standard");
    expect(getKycAttempts).toHaveBeenCalledTimes(1);
  });

  it("does not approve imported onboarding status when Avenia exposes a different CPF", async () => {
    const { user, token } = await createAuthedUser("avenia-import-tax-mismatch@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-import-tax-mismatch", taxId: "08786985906" });
    await customer.update({ status: VerificationStatus.InReview });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-imported",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "sumsub_share_token"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getVerificationAttemptStatus: mock(async () => ({
            attempt: { id: "attempt-imported", result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }
          })),
          subaccountInfo: mock(async () => ({ accountInfo: { taxId: "111.444.777-35" } }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(kycCase.status).toBe(VerificationStatus.InReview);
  });

  it("approves imported onboarding status when Avenia returns a formatted matching CPF", async () => {
    const { user, token } = await createAuthedUser("avenia-import-tax-match@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-import-tax-match", taxId: "08786985906" });
    await customer.update({ status: VerificationStatus.InReview });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-imported",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "sumsub_share_token"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getVerificationAttemptStatus: mock(async () => ({
            attempt: { id: "attempt-imported", result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }
          })),
          subaccountInfo: mock(async () => ({ accountInfo: { taxId: "087.869.859-06" } }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.Approved);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
  });

  it("leaves onboarding unchanged when exact polling returns a mismatched attempt", async () => {
    const { user, token } = await createAuthedUser("avenia-attempt-mismatch@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-mismatch" });
    await customer.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-current",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyc",
      verificationMethod: "standard"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getVerificationAttemptStatus: mock(async () => ({
            attempt: { id: "attempt-other", result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.InReview);
    expect(customer.statusExternal).toBe("UNCHANGED");
    expect(kycCase.statusExternal).toBe("UNCHANGED");
  });

  it("keeps an imported individual case pending when its exact attempt expires", async () => {
    const { user, token } = await createAuthedUser("avenia-import-expired@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-import-expired" });
    await customer.update({ status: VerificationStatus.InReview });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-imported",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "sumsub_share_token"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getVerificationAttemptStatus: mock(async () => ({
            attempt: { id: "attempt-imported", status: KycAttemptStatus.EXPIRED }
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.Pending);
    expect(kycCase.status).toBe(VerificationStatus.Pending);
    expect(kycCase.statusExternal).toBe(KycAttemptStatus.EXPIRED);
  });

  it("preserves a rejection committed before stale processing progress is persisted", async () => {
    const { user, token } = await createAuthedUser("avenia-stale-processing@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-stale-processing" });
    await customer.update({ status: VerificationStatus.InReview });
    const kycCase = await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "attempt-stale",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getVerificationAttemptStatus: mock(async () => {
            await customer.update({ status: VerificationStatus.Rejected, statusExternal: KycAttemptStatus.COMPLETED });
            await kycCase.update({
              rejectedAt: new Date(),
              status: VerificationStatus.Rejected,
              statusExternal: KycAttemptStatus.COMPLETED
            });
            return { attempt: { id: "attempt-stale", status: KycAttemptStatus.PROCESSING } };
          })
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await customer.reload();
    await kycCase.reload();
    expect(customer.status).toBe(VerificationStatus.Rejected);
    expect(customer.statusExternal).toBe(KycAttemptStatus.COMPLETED);
    expect(kycCase.status).toBe(VerificationStatus.Rejected);
    expect(kycCase.statusExternal).toBe(KycAttemptStatus.COMPLETED);
  });

  it("throttles provider refreshes: back-to-back polls hit Avenia only once per customer", async () => {
    const { user, token } = await createAuthedUser("avenia-refresh-throttle@example.com");
    const customer = await createTestTaxId(user.id, { subAccountId: "sub-throttled" });
    await customer.update({ status: VerificationStatus.InReview });
    await KycCase.create({
      customerEntityId: customer.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCustomerId: customer.id,
      status: VerificationStatus.InReview,
      type: "kyc",
      verificationMethod: "standard"
    });

    const getKycAttempts = mock(async () => ({
      attempts: [{ result: KycAttemptResult.APPROVED, status: KycAttemptStatus.COMPLETED }]
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(() => ({ getKycAttempts }) as unknown as BrlaApiService);

    try {
      await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(getKycAttempts).toHaveBeenCalledTimes(1);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }
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

    const getKybAttemptStatus = mock(async () => ({
      attempt: { id: "attempt-1", status: KycAttemptStatus.PENDING }
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus
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
    expect(getKybAttemptStatus).toHaveBeenCalledWith("attempt-1", "kyb-subaccount");
    expect(business.status).toBe(VerificationStatus.Pending);
    expect(kycCase.status).toBe(VerificationStatus.Pending);
  });

  it("reconciles an approved legacy-shaped business attempt through its bound subaccount", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-approved@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "approved-subaccount",
      taxId: "22333444000162"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "approved-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getKybAttemptStatus = mock(async () => ({
      attempt: {
        id: "approved-attempt",
        levelName: "level-1",
        result: KycAttemptResult.APPROVED,
        status: KycAttemptStatus.COMPLETED,
        submissionData: undefined
      }
    }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(() => ({ getKybAttemptStatus }) as unknown as BrlaApiService);

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        entities: Array<{ accounts: Array<{ provider: string; state: string }> }>;
      };
      expect(body.entities[0].accounts.find(account => account.provider === "avenia")?.state).toBe("approved");
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    expect(getKybAttemptStatus).toHaveBeenCalledWith("approved-attempt", "approved-subaccount");
    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Approved);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.approvedAt).toBeInstanceOf(Date);
  });

  it("persists the mapped failure reason on both rows and queues the email when the dashboard poll settles a KYB rejection", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-rejected-reason@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "rejected-subaccount",
      taxId: "66777888000186"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "rejected-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "rejected-attempt",
              result: KycAttemptResult.REJECTED,
              resultMessage: "the company name does not match the registry",
              status: KycAttemptStatus.COMPLETED,
              updatedAt: "2026-08-24T00:00:00.000Z"
            }
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        entities: Array<{
          accounts: Array<{ kycCase: { failureReasons: string[] | null } | null; provider: string; state: string }>;
        }>;
      };
      const aveniaAccount = body.entities[0].accounts.find(account => account.provider === "avenia");
      expect(aveniaAccount?.state).toBe("rejected");
      expect(aveniaAccount?.kycCase?.failureReasons).toEqual(["name"]);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Rejected);
    expect(business.lastFailureReasons).toEqual(["name"]);
    expect(kycCase.status).toBe(VerificationStatus.Rejected);
    expect(kycCase.failureReasons).toEqual(["name"]);
    expect(kycCase.rejectedAt).toBeInstanceOf(Date);

    const rows = await EmailNotification.findAll({ where: { resourceId: "rejected-attempt" } });
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(NotificationType.VerificationRejected);
    expect(rows[0].userId).toBe(user.id);
    expect(rows[0].payload).toMatchObject({
      reason: "the company name does not match the registry",
      subject: "business"
    });
  });

  it("queues exactly one approval email and clears stale failure reasons when the dashboard poll settles a KYB approval", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-approved-email@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "approved-email-subaccount",
      taxId: "77888999000167"
    });
    // A retried attempt after an earlier rejection: approval must clear the stale reasons,
    // matching what GET /v1/brla/kyb/attempt-status writes when it wins instead.
    await business.update({
      lastFailureReasons: ["unknown"],
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING
    });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      failureReasons: ["unknown"],
      level: "level_1",
      provider: "avenia",
      providerCaseId: "approved-email-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "approved-email-attempt",
              result: KycAttemptResult.APPROVED,
              status: KycAttemptStatus.COMPLETED,
              updatedAt: "2026-08-24T00:00:00.000Z"
            }
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Approved);
    expect(business.lastFailureReasons).toEqual([]);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.failureReasons).toEqual([]);

    const rows = await EmailNotification.findAll();
    expect(rows).toHaveLength(1);
    expect(rows[0].type).toBe(NotificationType.VerificationApproved);
    expect(rows[0].resourceId).toBe("approved-email-attempt");
    expect(rows[0].userId).toBe(user.id);
  });

  it("rolls back the outcome email when the authenticated KYB status transaction fails", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-rollback@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "rollback-subaccount",
      taxId: "66777888000186"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "rollback-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "rollback-attempt",
              result: KycAttemptResult.APPROVED,
              status: KycAttemptStatus.COMPLETED,
              updatedAt: "2026-08-25T12:00:00.000Z"
            }
          }))
        }) as unknown as BrlaApiService
    );
    const update = ProviderCustomer.prototype.update;
    ProviderCustomer.prototype.update = mock(async () => {
      throw new Error("forced provider-customer update failure");
    }) as unknown as typeof ProviderCustomer.prototype.update;

    try {
      const response = await api.request("/v1/brla/kyb/attempt-status?attemptId=rollback-attempt", {
        headers: authHeaders(token)
      });
      expect(response.status).toBe(500);
    } finally {
      ProviderCustomer.prototype.update = update;
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.InReview);
    expect(kycCase.status).toBe(VerificationStatus.InReview);
    expect(await EmailNotification.count({ where: { resourceId: "rollback-attempt" } })).toBe(0);
  });

  it("does not double-send when the webhook, worker, or authenticated route replays a dashboard-settled outcome", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-settled-race@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "settled-race-subaccount",
      taxId: "88999000000148"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "settled-race-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const attempt = {
      id: "settled-race-attempt",
      result: KycAttemptResult.APPROVED,
      status: KycAttemptStatus.COMPLETED,
      updatedAt: "2026-08-24T00:00:00.000Z"
    };
    const getKybAttemptStatus = mock(async () => ({ attempt }));
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(() => ({ getKybAttemptStatus }) as unknown as BrlaApiService);

    try {
      const settle = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(settle.status).toBe(200);
      expect(await EmailNotification.count({ where: { resourceId: "settled-race-attempt" } })).toBe(1);

      // Webhook replay: the receiver enqueues the same attempt for the same owner.
      await enqueueVerificationNotification(attempt, user.id, "business");

      // Worker sweep: a settled case is excluded by its terminal status and the queued-outcome anti-join.
      const worker = new KybStatusWorker() as unknown as { poll: () => Promise<void> };
      await worker.poll();

      // Authenticated route replay: an approved account short-circuits before persistence or enqueue.
      const route = await api.request("/v1/brla/kyb/attempt-status?attemptId=settled-race-attempt", {
        headers: authHeaders(token)
      });
      expect(route.status).toBe(200);
      expect(((await route.json()) as { result: string }).result).toBe(KycAttemptResult.APPROVED);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    // Only the dashboard settle hit the provider; every replay deduped to the single row.
    expect(getKybAttemptStatus).toHaveBeenCalledTimes(1);
    expect(await EmailNotification.count({ where: { resourceId: "settled-race-attempt" } })).toBe(1);
  });

  it("keeps an approval and queues no rejection email when a stale rejected read loses the race", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-stale-rejection@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "stale-rejection-subaccount",
      taxId: "99000111000129"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "stale-rejection-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => {
            // The authenticated route wins the race with an approval while this poll's
            // provider read is in flight and comes back stale-rejected.
            await business.update({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED });
            await kycCase.update({
              approvedAt: new Date(),
              status: VerificationStatus.Approved,
              statusExternal: KycAttemptStatus.COMPLETED
            });
            return {
              attempt: {
                id: "stale-rejection-attempt",
                result: KycAttemptResult.REJECTED,
                resultMessage: "the company name does not match the registry",
                status: KycAttemptStatus.COMPLETED,
                updatedAt: "2026-08-24T00:00:00.000Z"
              }
            };
          })
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Approved);
    expect(business.lastFailureReasons).toEqual([]);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.failureReasons).toEqual([]);
    expect(await EmailNotification.count()).toBe(0);
  });

  it("does not mutate business onboarding when exact polling returns a mismatched attempt", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-mismatch@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "mismatch-subaccount",
      taxId: "33444555000143"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "current-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    const originalError = logger.error;
    const errorLog = mock(() => logger) as typeof logger.error;
    logger.error = errorLog;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => ({
            attempt: {
              id: "other-attempt",
              result: KycAttemptResult.APPROVED,
              status: KycAttemptStatus.COMPLETED
            }
          }))
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
      logger.error = originalError;
    }

    // The mismatch is an integrity event, not provider flakiness: it must surface at
    // error level with both attempt ids, matching the KYB worker's guard.
    expect(errorLog).toHaveBeenCalledWith(
      "Avenia returned attempt other-attempt when asked for current-attempt; skipping business status refresh"
    );
    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.InReview);
    expect(business.statusExternal).toBe("UNCHANGED");
    expect(kycCase.status).toBe(VerificationStatus.InReview);
    expect(kycCase.statusExternal).toBe("UNCHANGED");
  });

  it("does not downgrade a terminal business outcome with stale provider progress", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-stale-progress@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "stale-progress-subaccount",
      taxId: "55666777000105"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: KycAttemptStatus.PROCESSING });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "stale-progress-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: KycAttemptStatus.PROCESSING,
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => {
            await business.update({ status: VerificationStatus.Approved, statusExternal: KycAttemptStatus.COMPLETED });
            await kycCase.update({
              approvedAt: new Date(),
              status: VerificationStatus.Approved,
              statusExternal: KycAttemptStatus.COMPLETED
            });
            return { attempt: { id: "stale-progress-attempt", status: KycAttemptStatus.PROCESSING } };
          })
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
    }

    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.Approved);
    expect(business.statusExternal).toBe(KycAttemptStatus.COMPLETED);
    expect(kycCase.status).toBe(VerificationStatus.Approved);
    expect(kycCase.statusExternal).toBe(KycAttemptStatus.COMPLETED);
  });

  it("keeps cached business onboarding state and logs safe identifiers when Avenia is unavailable", async () => {
    const { user, token } = await createAuthedUser("avenia-kyb-provider-failure@example.com");
    const business = await createTestTaxId(user.id, {
      customerType: "business",
      subAccountId: "failure-subaccount",
      taxId: "44555666000124"
    });
    await business.update({ status: VerificationStatus.InReview, statusExternal: "UNCHANGED" });
    const kycCase = await KycCase.create({
      customerEntityId: business.customerEntityId,
      level: "level_1",
      provider: "avenia",
      providerCaseId: "failure-attempt",
      providerCustomerId: business.id,
      status: VerificationStatus.InReview,
      statusExternal: "UNCHANGED",
      type: "kyb"
    });
    const getInstance = BrlaApiService.getInstance;
    const originalWarn = logger.warn;
    const warn = mock(() => logger) as typeof logger.warn;
    logger.warn = warn;
    BrlaApiService.getInstance = mock(
      () =>
        ({
          getKybAttemptStatus: mock(async () => {
            throw new Error("provider unavailable");
          })
        }) as unknown as BrlaApiService
    );

    try {
      const response = await api.request("/v1/onboarding/status", { headers: authHeaders(token) });
      expect(response.status).toBe(200);
    } finally {
      BrlaApiService.getInstance = getInstance;
      logger.warn = originalWarn;
    }

    expect(warn).toHaveBeenCalledWith("Avenia business KYB status refresh failed", {
      errorName: "Error",
      providerCaseId: "failure-attempt",
      providerCustomerId: business.id,
      providerStatus: undefined
    });
    await business.reload();
    await kycCase.reload();
    expect(business.status).toBe(VerificationStatus.InReview);
    expect(business.statusExternal).toBe("UNCHANGED");
    expect(kycCase.status).toBe(VerificationStatus.InReview);
    expect(kycCase.statusExternal).toBe("UNCHANGED");
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
    const alfredpay = await createTestAlfredpayCustomer(user.id, { country: DomesticCountry.MX });
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
