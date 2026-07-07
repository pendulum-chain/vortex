import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import { AlfredPayStatus } from "@vortexfi/shared";
import Notification from "../models/notification.model";
import CustomerEntity from "../models/customerEntity.model";
import ProviderCustomer from "../models/providerCustomer.model";
import RecipientInvitation from "../models/recipientInvitation.model";
import RecipientPayoutReference from "../models/recipientPayoutReference.model";
import SenderRecipient from "../models/senderRecipient.model";
import User from "../models/user.model";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
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

const MX_CORRIDOR = { country: "MX", payoutCurrency: "mxn", rail: "mxn" };

async function createInvite(
  token: string,
  overrides: Record<string, unknown> = {}
): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api.request("/v1/recipients/invite", {
    body: JSON.stringify({ ...MX_CORRIDOR, ...overrides }),
    headers: authHeaders(token),
    method: "POST"
  });
  return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

async function acceptInvite(token: string, inviteToken: string): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await api.request(`/v1/recipients/invite/${inviteToken}/accept`, {
    headers: authHeaders(token),
    method: "POST"
  });
  return { body: (await response.json()) as Record<string, unknown>, status: response.status };
}

describe("POST /v1/recipients/invite", () => {
  it("requires authentication", async () => {
    const response = await api.request("/v1/recipients/invite", {
      body: JSON.stringify(MX_CORRIDOR),
      headers: { "Content-Type": "application/json" },
      method: "POST"
    });
    expect(response.status).toBe(401);
  });

  it("creates an invite, returns the raw token once and stores only its hash", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const { status, body } = await createInvite(sender.token, { inviteeEmail: "Bob@Example.com" });

    expect(status).toBe(201);
    expect(typeof body.token).toBe("string");
    expect((body.token as string).length).toBeGreaterThanOrEqual(24);
    expect(body.status).toBe("pending");
    expect(body.expiresAt).toBeTruthy();

    const stored = await RecipientInvitation.findByPk(body.id as string);
    expect(stored).not.toBeNull();
    expect(stored?.tokenHash).not.toBe(body.token);
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.inviteeEmailCanonical).toBe("bob@example.com");
  });

  it("rejects an invite without a corridor", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const { status, body } = await createInvite(sender.token, { rail: undefined });
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_INVITE_CORRIDOR");
  });
});

describe("POST /v1/recipients/invite/:token/accept", () => {
  it("accepts a pending invite, creating an active relationship and notifying the sender", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);

    const { status, body } = await acceptInvite(recipient.token, invite.body.token as string);
    expect(status).toBe(201);
    expect(body.relationshipStatus).toBe("active");

    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    expect(invitation?.status).toBe("accepted");
    expect(invitation?.acceptedByProfileId).toBe(recipient.user.id);

    const relationship = await SenderRecipient.findByPk(body.id as string);
    expect(relationship?.relationshipStatus).toBe("active");

    const senderNotifications = await Notification.findAll({ where: { profileId: sender.user.id } });
    expect(senderNotifications.map(n => n.type)).toContain("recipient_invite_accepted");
  });

  it("rejects a second acceptance of the same invite", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);

    await acceptInvite(recipient.token, invite.body.token as string);
    const second = await acceptInvite(recipient.token, invite.body.token as string);
    expect(second.status).toBe(409);
    expect((second.body.error as { code: string }).code).toBe("INVITE_ALREADY_ACCEPTED");
  });

  it("binds redemption to the invitee email when one was recorded (case-insensitive)", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token, { inviteeEmail: "Bob@Example.com" });

    const stranger = await createAuthedUser("mallory@example.com");
    const denied = await acceptInvite(stranger.token, invite.body.token as string);
    expect(denied.status).toBe(403);
    expect((denied.body.error as { code: string }).code).toBe("INVITE_EMAIL_MISMATCH");

    const bob = await createAuthedUser("bob@example.com");
    const accepted = await acceptInvite(bob.token, invite.body.token as string);
    expect(accepted.status).toBe(201);
  });

  it("rejects accepting your own invite", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token);
    const { status, body } = await acceptInvite(sender.token, invite.body.token as string);
    expect(status).toBe(409);
    expect((body.error as { code: string }).code).toBe("CANNOT_ACCEPT_OWN_INVITE");
  });

  it("rejects an expired invite and marks it expired", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    await RecipientInvitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invite.body.id as string } });

    const { status, body } = await acceptInvite(recipient.token, invite.body.token as string);
    expect(status).toBe(410);
    expect((body.error as { code: string }).code).toBe("INVITE_EXPIRED");
    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    expect(invitation?.status).toBe("expired");
  });

  it("returns 404 for an unknown token", async () => {
    const recipient = await createAuthedUser("recipient@example.com");
    const { status } = await acceptInvite(recipient.token, "not-a-real-token");
    expect(status).toBe(404);
  });

  it("does not resurrect a blocked relationship through a new invite", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const first = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, first.body.token as string);

    await api.request(`/v1/recipients/${accepted.body.id}`, {
      body: JSON.stringify({ status: "blocked" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });

    const second = await createInvite(sender.token);
    const retry = await acceptInvite(recipient.token, second.body.token as string);
    expect(retry.status).toBe(409);
    expect((retry.body.error as { code: string }).code).toBe("RELATIONSHIP_BLOCKED");

    const relationship = await SenderRecipient.findByPk(accepted.body.id as string);
    expect(relationship?.relationshipStatus).toBe("blocked");
    const invitation = await RecipientInvitation.findByPk(second.body.id as string);
    expect(invitation?.status).toBe("pending");
  });
});

describe("GET /v1/recipients", () => {
  it("lists pending invitations before acceptance and relationships after", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);

    const beforeAccept = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const beforeBody = (await beforeAccept.json()) as { recipients: unknown[]; pendingInvitations: unknown[] };
    expect(beforeBody.recipients).toHaveLength(0);
    expect(beforeBody.pendingInvitations).toHaveLength(1);

    await acceptInvite(recipient.token, invite.body.token as string);

    const afterAccept = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const afterBody = (await afterAccept.json()) as {
      recipients: Array<{ relationshipStatus: string; onboardingStatus: string; invitation: { rail: string } }>;
      pendingInvitations: unknown[];
    };
    expect(afterBody.pendingInvitations).toHaveLength(0);
    expect(afterBody.recipients).toHaveLength(1);
    expect(afterBody.recipients[0].relationshipStatus).toBe("active");
    expect(afterBody.recipients[0].onboardingStatus).toBe("pending");
    expect(afterBody.recipients[0].invitation.rail).toBe("mxn");
  });
});

describe("PATCH /v1/recipients/:id", () => {
  async function acceptedRelationship() {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);
    return { recipient, relationshipId: accepted.body.id as string, sender };
  }

  it("updates nickname and status", async () => {
    const { sender, relationshipId } = await acceptedRelationship();

    const response = await api.request(`/v1/recipients/${relationshipId}`, {
      body: JSON.stringify({ nickname: "Mom", status: "archived" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });
    expect(response.status).toBe(200);
    const relationship = await SenderRecipient.findByPk(relationshipId);
    expect(relationship?.nickname).toBe("Mom");
    expect(relationship?.relationshipStatus).toBe("archived");
    expect(relationship?.disabledAt).not.toBeNull();
  });

  it("rejects an invalid status", async () => {
    const { sender, relationshipId } = await acceptedRelationship();
    const response = await api.request(`/v1/recipients/${relationshipId}`, {
      body: JSON.stringify({ status: "invited" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });
    expect(response.status).toBe(400);
  });

  it("is scoped to the sender that owns the relationship", async () => {
    const { relationshipId } = await acceptedRelationship();
    const otherSender = await createAuthedUser("other-sender@example.com");
    const response = await api.request(`/v1/recipients/${relationshipId}`, {
      body: JSON.stringify({ nickname: "Not yours" }),
      headers: authHeaders(otherSender.token),
      method: "PATCH"
    });
    expect(response.status).toBe(404);
  });
});

describe("GET /v1/recipients/:id/eligibility", () => {
  async function eligibilityOf(senderToken: string, relationshipId: string): Promise<Record<string, unknown>> {
    const response = await api.request(`/v1/recipients/${relationshipId}/eligibility`, {
      headers: authHeaders(senderToken)
    });
    expect(response.status).toBe(200);
    return (await response.json()) as Record<string, unknown>;
  }

  it("walks the full gate: onboarding → payout reference → eligible → restricted", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);
    const relationshipId = accepted.body.id as string;

    // No provider account yet.
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "recipient_onboarding_pending",
      canCreateTransfer: false
    });

    // Provider onboarding in progress.
    const recipientEntity = await CustomerEntity.findOne({ where: { profileId: recipient.user.id, type: "individual" } });
    if (!recipientEntity) throw new Error("recipient entity missing");
    const providerCustomer = await ProviderCustomer.create({
      country: "MX",
      customerEntityId: recipientEntity.id,
      customerType: "individual",
      provider: "alfredpay",
      providerCustomerId: "alfredpay-recipient-1",
      rail: "mxn",
      status: AlfredPayStatus.Verifying
    });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "recipient_onboarding_pending",
      canCreateTransfer: false
    });

    // Onboarding approved, but no verified payout reference.
    await providerCustomer.update({ status: AlfredPayStatus.Success });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "provider_payout_reference_unverified",
      canCreateTransfer: false
    });

    // Verified payout reference → transfers allowed.
    const payoutReference = await RecipientPayoutReference.create({
      country: "MX",
      currency: "mxn",
      instrumentType: "clabe",
      maskedDisplayLabel: "CLABE ****7895",
      provider: "alfredpay",
      providerInstrumentId: "fiat-account-1",
      rail: "mxn",
      recipientCustomerEntityId: recipientEntity.id,
      senderRecipientId: relationshipId,
      status: "verified"
    });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({ canCreateTransfer: true });

    // Provider later restricts the account.
    await providerCustomer.update({ status: AlfredPayStatus.Failed });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "provider_restricted",
      canCreateTransfer: false
    });

    // Payout reference disabled → back to unverified even when provider recovers.
    await providerCustomer.update({ status: AlfredPayStatus.Success });
    await payoutReference.update({ status: "disabled" });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "provider_payout_reference_unverified",
      canCreateTransfer: false
    });
  });

  it("reports a blocked relationship as not active", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);
    const relationshipId = accepted.body.id as string;

    await api.request(`/v1/recipients/${relationshipId}`, {
      body: JSON.stringify({ status: "blocked" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });

    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "relationship_not_active",
      canCreateTransfer: false
    });
  });
});
