import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import Notification from "../models/notification.model";
import CustomerEntity from "../models/customerEntity.model";
import ProviderCustomer, { VerificationStatus } from "../models/providerCustomer.model";
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

  it("creates an invite, returning the raw token and storing it alongside its hash while pending", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const { status, body } = await createInvite(sender.token, { alias: "Bob's link", inviteeEmail: "Bob@Example.com" });

    expect(status).toBe(201);
    expect(typeof body.token).toBe("string");
    expect((body.token as string).length).toBeGreaterThanOrEqual(24);
    expect(body.status).toBe("pending");
    expect(body.alias).toBe("Bob's link");
    expect(body.expiresAt).toBeTruthy();

    const stored = await RecipientInvitation.findByPk(body.id as string);
    expect(stored).not.toBeNull();
    // The hash stays the redemption key; the raw token is retained for sender re-copy.
    expect(stored?.tokenHash).not.toBe(body.token);
    expect(stored?.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    expect(stored?.token).toBe(body.token as string);
    expect(stored?.alias).toBe("Bob's link");
    expect(stored?.inviteeEmailCanonical).toBe("bob@example.com");
  });

  it("rejects an invite without a corridor", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const { status, body } = await createInvite(sender.token, { rail: undefined });
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_INVITE_CORRIDOR");
  });

  it("rejects an alias longer than 100 characters", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const { status, body } = await createInvite(sender.token, { alias: "x".repeat(101) });
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_ALIAS");
  });
});

describe("POST /v1/recipients/invite/:token/accept", () => {
  it("returns the invitee type and binds business recipients to a business entity", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("business-recipient@example.com");
    const invite = await createInvite(sender.token, { inviteeType: "business" });

    const { status, body } = await acceptInvite(recipient.token, invite.body.token as string);

    expect(status).toBe(201);
    expect((body.invitation as { inviteeType: string }).inviteeType).toBe("business");
    const relationship = await SenderRecipient.findByPk(body.id as string);
    const entity = await CustomerEntity.findByPk(relationship?.recipientCustomerEntityId);
    expect(entity?.type).toBe("business");
  });

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
    // Acceptance clears the retained raw token — re-copy is a pending-only affordance.
    expect(invitation?.token).toBeNull();

    const relationship = await SenderRecipient.findByPk(body.id as string);
    expect(relationship?.relationshipStatus).toBe("active");

    const senderNotifications = await Notification.findAll({ where: { profileId: sender.user.id } });
    expect(senderNotifications.map(n => n.type)).toContain("recipient_invite_accepted");
  });

  it("lets the accepting recipient re-enter their own link without re-notifying the sender", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);

    const first = await acceptInvite(recipient.token, invite.body.token as string);
    expect(first.status).toBe(201);
    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    const originalAcceptedAt = invitation?.acceptedAt;

    // Reopening the link mid-KYC resumes the same relationship rather than 409-ing.
    const second = await acceptInvite(recipient.token, invite.body.token as string);
    expect(second.status).toBe(200);
    expect(second.body.id).toBe(first.body.id as string);
    expect(second.body.relationshipStatus).toBe("active");

    const reread = await RecipientInvitation.findByPk(invite.body.id as string);
    expect(reread?.acceptedAt).toEqual(originalAcceptedAt as Date);

    const accepted = (await Notification.findAll({ where: { profileId: sender.user.id } })).filter(
      n => n.type === "recipient_invite_accepted"
    );
    expect(accepted).toHaveLength(1);
  });

  it("rejects a second acceptance by a different recipient", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const stranger = await createAuthedUser("stranger@example.com");
    const invite = await createInvite(sender.token);

    await acceptInvite(recipient.token, invite.body.token as string);
    const second = await acceptInvite(stranger.token, invite.body.token as string);
    expect(second.status).toBe(409);
    expect((second.body.error as { code: string }).code).toBe("INVITE_ALREADY_ACCEPTED");
  });

  // Invariant 3 (one relationship per invite) under concurrency: both requests pass the
  // unlocked pre-checks; the row-locked re-check inside the transaction must let exactly
  // one of them create a relationship.
  it("lets exactly one of two concurrent acceptances by different recipients through", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const stranger = await createAuthedUser("stranger@example.com");
    const invite = await createInvite(sender.token);

    const [first, second] = await Promise.all([
      acceptInvite(recipient.token, invite.body.token as string),
      acceptInvite(stranger.token, invite.body.token as string)
    ]);

    const statuses = [first.status, second.status].sort();
    expect(statuses).toEqual([201, 409]);
    expect(await SenderRecipient.count()).toBe(1);

    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    const winner = first.status === 201 ? recipient : stranger;
    expect(invitation?.acceptedByProfileId).toBe(winner.user.id);
  });

  it("lets the recipient re-enter after the invite's expiry passes", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    await acceptInvite(recipient.token, invite.body.token as string);

    // KYC can take days; an expiry passing after acceptance must not strand the recipient.
    await RecipientInvitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invite.body.id as string } });

    const { status } = await acceptInvite(recipient.token, invite.body.token as string);
    expect(status).toBe(200);
    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    expect(invitation?.status).toBe("accepted");
  });

  it("does not revive an archived relationship on re-entry", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);

    await api.request(`/v1/recipients/${accepted.body.id}`, {
      body: JSON.stringify({ status: "archived" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });

    const { status } = await acceptInvite(recipient.token, invite.body.token as string);
    expect(status).toBe(200);
    const relationship = await SenderRecipient.findByPk(accepted.body.id as string);
    expect(relationship?.relationshipStatus).toBe("archived");
  });

  it("still blocks re-entry once the sender has blocked the relationship", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);

    await api.request(`/v1/recipients/${accepted.body.id}`, {
      body: JSON.stringify({ status: "blocked" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });

    const retry = await acceptInvite(recipient.token, invite.body.token as string);
    expect(retry.status).toBe(409);
    expect((retry.body.error as { code: string }).code).toBe("RELATIONSHIP_BLOCKED");
  });

  it("still rejects re-entry on a revoked invite", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    await acceptInvite(recipient.token, invite.body.token as string);

    await RecipientInvitation.update({ status: "revoked" }, { where: { id: invite.body.id as string } });

    const { status, body } = await acceptInvite(recipient.token, invite.body.token as string);
    expect(status).toBe(410);
    expect((body.error as { code: string }).code).toBe("INVITE_REVOKED");
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
    const invite = await createInvite(sender.token, { alias: "Maria · MXN" });

    const beforeAccept = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const beforeBody = (await beforeAccept.json()) as {
      recipients: unknown[];
      pendingInvitations: Array<{ alias: string | null; token: string | null }>;
    };
    expect(beforeBody.recipients).toHaveLength(0);
    expect(beforeBody.pendingInvitations).toHaveLength(1);
    // The pending list carries the alias and the raw token so the sender can re-copy the link.
    expect(beforeBody.pendingInvitations[0].alias).toBe("Maria · MXN");
    expect(beforeBody.pendingInvitations[0].token).toBe(invite.body.token as string);

    await acceptInvite(recipient.token, invite.body.token as string);

    const afterAccept = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const afterBody = (await afterAccept.json()) as {
      recipients: Array<{
        relationshipStatus: string;
        onboardingStatus: string;
        invitation: { rail: string; alias: string | null };
      }>;
      pendingInvitations: unknown[];
    };
    expect(afterBody.pendingInvitations).toHaveLength(0);
    expect(afterBody.recipients).toHaveLength(1);
    expect(afterBody.recipients[0].relationshipStatus).toBe("active");
    expect(afterBody.recipients[0].onboardingStatus).toBe("pending");
    expect(afterBody.recipients[0].invitation.rail).toBe("mxn");
    expect(afterBody.recipients[0].invitation.alias).toBe("Maria · MXN");
  });

  it("hides archived relationships from the list", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);

    await api.request(`/v1/recipients/${accepted.body.id}`, {
      body: JSON.stringify({ status: "archived" }),
      headers: authHeaders(sender.token),
      method: "PATCH"
    });

    const response = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const body = (await response.json()) as { recipients: unknown[]; pendingInvitations: unknown[] };
    expect(body.recipients).toHaveLength(0);
    expect(body.pendingInvitations).toHaveLength(0);
  });

  it("expires and hides pending invitations whose TTL has passed", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token);
    await RecipientInvitation.update({ expiresAt: new Date(Date.now() - 1000) }, { where: { id: invite.body.id as string } });

    const response = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const body = (await response.json()) as { recipients: unknown[]; pendingInvitations: unknown[] };
    expect(body.pendingInvitations).toHaveLength(0);

    const invitation = await RecipientInvitation.findByPk(invite.body.id as string);
    expect(invitation?.status).toBe("expired");
    expect(invitation?.token).toBeNull();
  });

  it("does not report a business recipient approved off an individual provider approval", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token, { inviteeType: "business" });
    await acceptInvite(recipient.token, invite.body.token as string);

    const recipientEntity = await CustomerEntity.findOne({ where: { profileId: recipient.user.id, type: "business" } });
    if (!recipientEntity) throw new Error("recipient business entity missing");
    // Approved as an individual only — the business invite's corridor is still unonboarded,
    // so the summary must agree with the eligibility gate and stay pending.
    await ProviderCustomer.create({
      country: "MX",
      customerEntityId: recipientEntity.id,
      customerType: "individual",
      provider: "alfredpay",
      providerCustomerId: "alfredpay-individual-1",
      rail: "mxn",
      status: VerificationStatus.Approved
    });

    const response = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const body = (await response.json()) as { recipients: Array<{ onboardingStatus: string }> };
    expect(body.recipients).toHaveLength(1);
    expect(body.recipients[0].onboardingStatus).toBe("pending");

    await ProviderCustomer.create({
      country: "MX",
      customerEntityId: recipientEntity.id,
      customerType: "business",
      provider: "alfredpay",
      providerCustomerId: "alfredpay-business-1",
      rail: "mxn",
      status: VerificationStatus.Approved
    });

    const afterBusiness = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const afterBody = (await afterBusiness.json()) as { recipients: Array<{ onboardingStatus: string }> };
    expect(afterBody.recipients[0].onboardingStatus).toBe("approved");
  });
});

describe("PATCH /v1/recipients/invitations/:id", () => {
  async function archiveInvitation(
    senderToken: string,
    invitationId: string,
    archived: unknown
  ): Promise<{ status: number; body: Record<string, unknown> }> {
    const response = await api.request(`/v1/recipients/invitations/${invitationId}`, {
      body: JSON.stringify({ archived }),
      headers: authHeaders(senderToken),
      method: "PATCH"
    });
    return { body: (await response.json()) as Record<string, unknown>, status: response.status };
  }

  it("requires authentication", async () => {
    const response = await api.request("/v1/recipients/invitations/some-id", {
      body: JSON.stringify({ archived: true }),
      headers: { "Content-Type": "application/json" },
      method: "PATCH"
    });
    expect(response.status).toBe(401);
  });

  it("archives a pending invitation out of the list without revoking its token", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const recipient = await createAuthedUser("recipient@example.com");
    const invite = await createInvite(sender.token);

    const archived = await archiveInvitation(sender.token, invite.body.id as string, true);
    expect(archived.status).toBe(200);
    expect(archived.body.archived).toBe(true);

    const list = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const listBody = (await list.json()) as { pendingInvitations: unknown[] };
    expect(listBody.pendingInvitations).toHaveLength(0);

    // Archive is a list hide, not a revocation: the link still redeems and KYC can proceed.
    const accepted = await acceptInvite(recipient.token, invite.body.token as string);
    expect(accepted.status).toBe(201);
    expect(accepted.body.relationshipStatus).toBe("active");
  });

  it("unarchives an invitation back into the list", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token);

    await archiveInvitation(sender.token, invite.body.id as string, true);
    const unarchived = await archiveInvitation(sender.token, invite.body.id as string, false);
    expect(unarchived.status).toBe(200);
    expect(unarchived.body.archived).toBe(false);

    const list = await api.request("/v1/recipients", { headers: authHeaders(sender.token) });
    const listBody = (await list.json()) as { pendingInvitations: unknown[] };
    expect(listBody.pendingInvitations).toHaveLength(1);
  });

  it("rejects a non-boolean archived flag", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token);
    const { status, body } = await archiveInvitation(sender.token, invite.body.id as string, "yes");
    expect(status).toBe(400);
    expect((body.error as { code: string }).code).toBe("INVALID_ARCHIVED");
  });

  it("is scoped to the sender that owns the invitation", async () => {
    const sender = await createAuthedUser("sender@example.com");
    const invite = await createInvite(sender.token);
    const otherSender = await createAuthedUser("other-sender@example.com");
    const { status } = await archiveInvitation(otherSender.token, invite.body.id as string, true);
    expect(status).toBe(404);
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
      status: VerificationStatus.InReview
    });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "recipient_onboarding_pending",
      canCreateTransfer: false
    });

    // Onboarding approved, but no verified payout reference.
    await providerCustomer.update({ status: VerificationStatus.Approved });
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
    await providerCustomer.update({ status: VerificationStatus.Rejected });
    expect(await eligibilityOf(sender.token, relationshipId)).toEqual({
      blockingReasonCode: "provider_restricted",
      canCreateTransfer: false
    });

    // Payout reference disabled → back to unverified even when provider recovers.
    await providerCustomer.update({ status: VerificationStatus.Approved });
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
