import { afterAll, beforeAll, describe, expect, it, spyOn } from "bun:test";
import { config } from "../../../config/vars";
import Membership from "../../../models/managedProfileMembership.model";
import MembershipEvent from "../../../models/managedProfileMembershipEvent.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { type FakeWorld, installFakeWorld } from "../../../test-utils/fake-world";
import { startTestApp, type TestApp } from "../../../test-utils/test-app";
import { SupabaseAuthService } from "../../services/auth";

describe("organization production route integration", () => {
  let app: TestApp;
  let world: FakeWorld;

  beforeAll(async () => {
    world = installFakeWorld();
    await setupTestDatabase();
    app = await startTestApp();
  });
  afterAll(async () => {
    await app?.close();
    world?.restore();
  });

  it("configures an empty organization through admin HTTP and inherits accepted membership across existing and future children", async () => {
    await resetTestDatabase();
    const owner = await createTestUser({ id: "abcdefab-1234-4567-89ab-abcdefabcdef", email: "owner@example.com" });
    const invitee = await createTestUser({ email: "invitee@example.com" });
    const outsider = await createTestUser({ email: "outsider@example.com" });
    const originalDashboardUrl = config.dashboardPublicUrl;
    config.dashboardPublicUrl = "https://dashboard.example.com";
    const auth = spyOn(SupabaseAuthService, "verifyToken").mockImplementation(async token => {
      const profile = [owner, invitee, outsider].find(profile => profile.id === token);
      return profile
        ? { valid: true, user_id: profile.id, email: profile.email!, email_confirmed_at: "2026-09-01T00:00:00Z" }
        : { valid: false };
    });
    const request = (path: string, token: string, method = "GET", body?: unknown) =>
      app.request(`/v1/${path}`, {
        method,
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      });
    try {
      const states = [
        [owner.id.toUpperCase(), true, 201],
        [owner.id.toUpperCase(), true, 200],
        ["AbCdEfAb-1234-4567-89Ab-aBcDeFaBcDeF", false, 200],
        [owner.id.toUpperCase(), true, 200]
      ] as const;
      for (const [id, isActive, status] of states) {
        const response = await request(`admin/managed-profile-managers/${id}`, config.adminSecret!, "PUT", {
          allowedCorridors: ["BR"],
          allowedCustomerTypes: null,
          isActive
        });
        expect(response.status).toBe(status);
        expect(await response.json()).toMatchObject({ manager: { profileId: owner.id, isActive } });
      }
      expect(await Membership.count()).toBe(1);
      expect(await MembershipEvent.count()).toBe(1);
      expect(await Membership.findOne()).toMatchObject({
        ownerProfileId: owner.id,
        memberProfileId: owner.id,
        createdByProfileId: null
      });
      expect(await MembershipEvent.findOne()).toMatchObject({
        ownerProfileId: owner.id,
        memberProfileId: owner.id,
        actorProfileId: null,
        action: "member_added"
      });
      expect(await (await request("managed-profiles", owner.id)).json()).toMatchObject({
        managedProfiles: [],
        pagination: { total: 0 }
      });

      const invited = await request(`organization/member-invitations?expectedOwnerProfileId=${owner.id}`, owner.id, "POST", {
        email: invitee.email,
        role: "read_only"
      });
      expect(invited.status).toBe(201);
      const { invitation } = await invited.json();
      // A child created while the invitation is pending is covered upon acceptance.
      const existing = await request(
        `admin/managed-profile-managers/${owner.id}/managed-profiles`,
        config.adminSecret!,
        "POST",
        { contactEmail: "existing@example.com", customerType: "business", externalSubjectId: "existing" }
      );
      expect(existing.status).toBe(201);
      const existingId = (await existing.json()).managedProfile.profileId;
      const accepted = await request(`organization-member-invitations/${invitation.id}/accept`, invitee.id, "POST", {});
      expect(accepted.status).toBe(200);
      expect(await accepted.json()).toMatchObject({
        ownerProfileId: owner.id,
        member: { memberProfileId: invitee.id, role: "read_only", isOwner: false }
      });
      const discovery = await request("organization", invitee.id);
      expect(discovery.status).toBe(200);
      expect(await discovery.json()).toEqual({
        organization: { ownerProfileId: owner.id, ownerEmail: owner.email, membership: { role: "read_only", isOwner: false } }
      });
      const future = await request("managed-profiles", owner.id, "POST", {
        contactEmail: "future@example.com",
        customerType: "individual",
        externalSubjectId: "future"
      });
      expect(future.status).toBe(201);
      const futureId = (await future.json()).managedProfile.profileId;

      expect(
        (
          await request(`admin/managed-profile-managers/${outsider.id}`, config.adminSecret!, "PUT", {
            allowedCorridors: ["BR"],
            isActive: true
          })
        ).status
      ).toBe(201);
      const foreign = await request("managed-profiles", outsider.id, "POST", {
        contactEmail: "foreign@example.com",
        customerType: "business",
        externalSubjectId: "foreign"
      });
      expect(foreign.status).toBe(201);
      const foreignId = (await foreign.json()).managedProfile.profileId;
      const listed = await request("managed-profiles", invitee.id);
      expect(listed.status).toBe(200);
      const roster = await listed.json();
      expect(roster.pagination.total).toBe(2);
      expect(roster.managedProfiles.map((child: { profileId: string }) => child.profileId).sort()).toEqual(
        [existingId, futureId].sort()
      );
      expect(
        roster.managedProfiles.every(
          (child: { membership: { role: string; isOwner: boolean } }) =>
            child.membership.role === "read_only" && !child.membership.isOwner
        )
      ).toBe(true);
      expect((await request(`managed-profiles/${foreignId}`, invitee.id)).status).toBe(404);
      expect(await Membership.count({ where: { memberProfileId: invitee.id, revokedAt: null } })).toBe(1);
      expect((await request(`managed-profiles/${existingId}/members`, owner.id)).status).toBe(404);
      expect((await request(`managed-profile-member-invitations/${invitation.id}`, invitee.id)).status).toBe(404);
      expect((await request(`managed-profile-member-invitations/${invitation.id}/accept`, invitee.id, "POST", {})).status).toBe(
        404
      );
    } finally {
      auth.mockRestore();
      config.dashboardPublicUrl = originalDashboardUrl;
    }
  });
});
