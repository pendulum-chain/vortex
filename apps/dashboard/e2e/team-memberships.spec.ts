import { expect, type Page, test } from "@playwright/test";
import type {
  InvitationPreview,
  MemberEvent,
  MemberInvitation,
  Organization,
  TeamMember
} from "../src/services/api/managed-profile-memberships.service";
import type { ManagedProfile } from "../src/services/api/managed-profiles.service";
import { APP_ORIGIN, E2E_MANAGED_PROFILE_ID, E2E_ORGANIZATION_OWNER_ID, mockBackend } from "./support/mockBackend";
import { E2E_USER_EMAIL, E2E_USER_ID, seedSession } from "./support/session";

const INVITATION_ID = "12345678-1234-1234-1234-123456789abc";
const INVITATION_PATH = `/member-invitations/${INVITATION_ID}`;
const NOW = "2026-09-01T12:00:00.000Z";
const OWNER_B = "22222222-2222-4222-8222-222222222222";

function organization(role: "manager" | "read_only" = "manager", isOwner = false): Organization {
  return {
    membership: { isOwner, role },
    ownerEmail: isOwner ? E2E_USER_EMAIL : "owner@example.test",
    ownerProfileId: isOwner ? E2E_USER_ID : E2E_ORGANIZATION_OWNER_ID
  };
}

function child(role: "manager" | "read_only" = "manager"): ManagedProfile {
  return {
    contactEmail: "child@example.test",
    customerType: "business",
    externalSubjectId: "Invited company",
    membership: { isOwner: false, role },
    policy: { allowedCorridors: ["MX"], allowedCustomerTypes: null },
    profileId: E2E_MANAGED_PROFILE_ID,
    status: "active"
  };
}
function member(index = 0): TeamMember {
  return {
    createdAt: NOW,
    email: index === 0 ? "owner@example.test" : `member-${index}@example.test`,
    id: `membership-${index}`,
    isOwner: index === 0,
    memberProfileId: `member-profile-${index}`,
    role: "manager",
    updatedAt: NOW
  };
}
function invitation(index = 0): MemberInvitation {
  return {
    acceptedAt: null,
    cancelledAt: null,
    createdAt: NOW,
    email: index === 0 ? E2E_USER_EMAIL : `invitee-${index}@example.test`,
    expiredAt: null,
    expiresAt: "2099-09-01T12:00:00.000Z",
    id: index === 0 ? INVITATION_ID : `invitation-${index}`,
    invitedByProfileId: E2E_ORGANIZATION_OWNER_ID,
    ownerProfileId: E2E_ORGANIZATION_OWNER_ID,
    role: "read_only",
    status: "pending"
  };
}
function preview(): InvitationPreview {
  return {
    invitation: invitation(),
    inviter: { email: "inviter@example.test", profileId: E2E_ORGANIZATION_OWNER_ID },
    organization: { ownerEmail: "owner@example.test", ownerProfileId: E2E_ORGANIZATION_OWNER_ID }
  };
}
function event(index: number): MemberEvent {
  return {
    action: "member_added",
    actorProfileId: `actor-${index}`,
    createdAt: NOW,
    id: `event-${index}`,
    invitationId: null,
    memberProfileId: `member-profile-${index}`,
    previousRole: null,
    role: "manager"
  };
}
async function selectChild(page: Page, profile = child(), impersonation = false) {
  await seedSession(page);
  await page.addInitScript(
    ({ profile, userId, impersonation }) => {
      if (impersonation)
        localStorage.setItem(
          "vortex_dashboard_impersonation_session",
          JSON.stringify({
            expiresAt: new Date(Date.now() + 600000).toISOString(),
            sessionId: "imp",
            targetEmail: "target@example.test",
            targetProfileId: userId,
            token: "vtx_imp_test"
          })
        );
      localStorage.setItem(
        "vortex_dashboard_managed_profile_selection",
        JSON.stringify({
          customerType: profile.customerType,
          externalSubjectId: profile.externalSubjectId,
          isOwner: profile.membership.isOwner,
          managerProfileId: userId,
          membershipRole: profile.membership.role,
          targetEmail: profile.contactEmail,
          targetProfileId: profile.profileId
        })
      );
    },
    { impersonation, profile, userId: E2E_USER_ID }
  );
}
async function noOverflow(page: Page) {
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
}

for (const mobile of [false, true]) {
  test(`Team manager confirmations, owner protection, and refresh (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const teammate = member(1);
    if (mobile) teammate.email = `${"long-team-member-".repeat(10)}@example.test`;
    const backend = await mockBackend(page, {
      organization: organization(),
      team: { events: [], invitations: [], members: [member(), teammate] }
    });
    await seedSession(page);
    await page.goto("/team");
    await expect(page.getByRole("heading", { exact: true, name: "Team" })).toBeVisible();
    if (mobile) await page.getByRole("button", { name: "Toggle Sidebar" }).click();
    await expect(page.getByRole("link", { exact: true, name: "Team" })).toBeVisible();
    if (mobile) await page.keyboard.press("Escape");
    await expect(page.getByText(/all current and future managed profiles/)).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    const owner = page.getByRole("listitem").filter({ hasText: "owner@example.test" });
    await expect(owner.getByText("Owner", { exact: true })).toBeVisible();
    await expect(owner.getByRole("button")).toHaveCount(0);
    await page.getByRole("button", { exact: true, name: "Invite member" }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Email").fill("New.Member@example.test");
    await expect(dialog.getByRole("combobox")).toHaveText("Read only");
    expect(backend.membershipRequests.filter(request => request.method !== "GET")).toEqual([]);
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByText("new.member@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("Invitation sent", { exact: true })).toBeVisible();
    await page.getByRole("button", { exact: true, name: "Cancel invitation" }).click();
    await dialog.getByRole("button", { exact: true, name: "Back" }).click();
    expect(backend.membershipRequests.filter(request => request.method === "DELETE")).toEqual([]);
    await page.getByRole("button", { exact: true, name: "Cancel invitation" }).click();
    await dialog.getByRole("button", { exact: true, name: "Cancel invitation" }).click();
    await expect(page.getByText("cancelled", { exact: true })).toBeVisible();
    const row = page.getByRole("listitem").filter({ hasText: teammate.email ?? teammate.memberProfileId });
    await row.getByRole("button", { name: "Change role" }).click();
    await expect(dialog.getByText(/provider, fiat-account, quote, and ramp operations/)).toBeVisible();
    await expect(dialog.getByText(/remain valid after a human member is removed or downgraded/)).toBeVisible();
    await dialog.getByRole("button", { name: "Change role" }).click();
    await expect(row.getByText("Read only", { exact: true })).toBeVisible();
    await row.getByRole("button", { name: "Remove member" }).click();
    await dialog.getByRole("button", { name: "Remove member" }).click();
    await expect(row).toHaveCount(0);
    await expect(page.getByText("Member removed", { exact: true })).toBeVisible();
    expect(backend.membershipRequests.filter(request => request.method !== "GET").map(request => request.method)).toEqual([
      "POST",
      "DELETE",
      "PATCH",
      "DELETE"
    ]);
    for (const request of backend.membershipRequests) {
      expect(new URLSearchParams(request.search).getAll("expectedOwnerProfileId")).toEqual([E2E_ORGANIZATION_OWNER_ID]);
    }
    expect(
      backend.apiRequests
        .filter(request => request.path.startsWith("/v1/organization/"))
        .every(request => request.managedProfileId === undefined)
    ).toBe(true);
    await noOverflow(page);
    expect(backend.unmatchedRequests).toEqual([]);
    expect(backend.unexpectedExternalRequests).toEqual([]);
  });

  test(`Team hides only the viewer's accepted invitation (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const backend = await mockBackend(page, {
      organization: organization(),
      team: {
        events: [{ ...event(0), action: "invitation_accepted", memberProfileId: E2E_USER_ID }],
        invitations: [
          { ...invitation(), acceptedAt: NOW, status: "accepted" },
          { ...invitation(1), acceptedAt: NOW, status: "accepted" },
          { ...invitation(2), email: E2E_USER_EMAIL }
        ],
        members: [member(), { ...member(1), email: E2E_USER_EMAIL, memberProfileId: E2E_USER_ID }]
      }
    });
    await seedSession(page);
    await page.goto("/team");
    const invitations = page.getByRole("list").filter({ has: page.getByText("Expires", { exact: false }) });
    await expect(invitations.getByRole("listitem")).toHaveCount(2);
    const own = invitations.getByRole("listitem").filter({ hasText: E2E_USER_EMAIL });
    await expect(own.getByText("pending", { exact: true })).toBeVisible();
    await expect(own.getByText("accepted", { exact: true })).toHaveCount(0);
    const other = invitations.getByRole("listitem").filter({ hasText: "invitee-1@example.test" });
    await expect(other.getByText("accepted", { exact: true })).toBeVisible();
    await expect(page.getByText("You", { exact: true })).toBeVisible();
    await expect(page.getByText("Invitation accepted", { exact: true })).toBeVisible();
    expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
    expect(backend.unmatchedRequests).toEqual([]);
    await noOverflow(page);
  });

  test(`Team keeps pagination reachable when accepted invitations are hidden (${mobile ? "mobile" : "desktop"})`, async ({
    page
  }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const backend = await mockBackend(page, {
      organization: organization("read_only"),
      team: {
        events: [],
        invitations: Array.from({ length: 21 }, (_, index) =>
          index === 0 || index === 20
            ? { ...invitation(index), acceptedAt: NOW, email: E2E_USER_EMAIL, status: "accepted" as const }
            : invitation(index)
        ),
        members: []
      }
    });
    await seedSession(page);
    await page.goto("/team");
    const invitations = page.getByRole("list").filter({ has: page.getByText("Expires", { exact: false }) });
    await expect(invitations.getByRole("listitem")).toHaveCount(19);
    await page.getByRole("button", { name: "Next invitations" }).click();
    await expect(page.getByText("No invitations on this page.")).toBeVisible();
    await expect(page.getByRole("button", { name: "Next invitations" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous invitations" }).click();
    await expect(invitations.getByRole("listitem")).toHaveCount(19);
    expect(backend.membershipRequests.some(request => request.search.includes("offset=20"))).toBe(true);
    expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
    expect(backend.unmatchedRequests).toEqual([]);
    await noOverflow(page);
  });

  test(`read-only Team paginates every list without mutation UI (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const backend = await mockBackend(page, {
      organization: organization("read_only"),
      team: {
        events: Array.from({ length: 21 }, (_, i) => event(i)),
        invitations: Array.from({ length: 21 }, (_, i) => invitation(i)),
        members: Array.from({ length: 21 }, (_, i) => member(i))
      }
    });
    await seedSession(page);
    await page.goto("/team");
    await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
    await expect(page.getByRole("button", { name: /Invite member|Change role|Remove member|Cancel invitation/ })).toHaveCount(
      0
    );
    await page.getByRole("button", { name: "Next members" }).click();
    await expect(page.getByText("member-20@example.test", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Next members" })).toBeDisabled();
    await page.getByRole("button", { name: "Previous members" }).click();
    await expect(page.getByText("owner@example.test", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Next invitations" }).click();
    await expect(page.getByText("invitee-20@example.test", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Previous invitations" }).click();
    await page.getByRole("button", { name: "Older events" }).click();
    await expect(page.getByText(/Actor: actor-20/)).toBeVisible();
    await expect(page.getByRole("button", { name: "Older events" })).toBeDisabled();
    await page.getByRole("button", { name: "Newer events" }).click();
    await expect(page.getByText(/Actor: actor-0 /)).toBeVisible();
    expect(backend.membershipRequests.some(request => request.search.includes("offset=20"))).toBe(true);
    expect(backend.membershipRequests.some(request => request.search.includes("cursor=event-19"))).toBe(true);
    expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
    await noOverflow(page);
    expect(backend.unmatchedRequests).toEqual([]);
  });

  for (const access of ["owner", "manager", "read_only"] as const) {
    test(`empty organization ${access} reaches main Team before account type selection (${mobile ? "mobile" : "desktop"})`, async ({
      page
    }) => {
      if (mobile) await page.setViewportSize({ height: 844, width: 390 });
      const org = organization(access === "read_only" ? "read_only" : "manager", access === "owner");
      org.ownerEmail = null;
      const backend = await mockBackend(page, {
        canProvisionManagedProfiles: access === "owner",
        organization: org,
        selectionRequired: true
      });
      await seedSession(page);
      await page.goto("/overview");
      if (mobile) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
      await page.getByRole("link", { exact: true, name: "Team" }).click();
      if (mobile) await page.keyboard.press("Escape");
      await expect(page.getByRole("heading", { exact: true, name: "Team" })).toBeVisible();
      await expect(page.getByText(`Organization: ${org.ownerProfileId}`, { exact: true })).toBeVisible();
      await expect(page.getByRole("button", { exact: true, name: "Invite member" })).toHaveCount(
        access === "read_only" ? 0 : 1
      );
      await page.goto("/managed-profiles");
      await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
      await expect(page.getByText(/You can provision/)).toHaveCount(access === "owner" ? 1 : 0);
      expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
      await noOverflow(page);
      expect(backend.unmatchedRequests).toEqual([]);
    });
  }

  test(`child navigation has no Team and child actions have no Manage team (${mobile ? "mobile" : "desktop"})`, async ({
    page
  }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const backend = await mockBackend(page, { managedProfiles: [child()] });
    await seedSession(page);
    await page.goto("/managed-profiles");
    await page.getByRole("button", { name: "Actions for child@example.test" }).filter({ visible: true }).click();
    await expect(page.getByRole("menuitem", { name: "Manage team" })).toHaveCount(0);
    await page.getByRole("menuitem", { name: "Act for this profile" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Act for this profile" }).click();
    await expect(page.getByText("Acting for child@example.test")).toBeVisible();
    if (mobile) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
    await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
    if (mobile) await page.keyboard.press("Escape");
    await page.goto("/team");
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByText("Acting for child@example.test")).toBeVisible();
    expect(backend.membershipRequests).toEqual([]);
    expect(backend.unmatchedRequests).toEqual([]);
    await noOverflow(page);
  });

  test(`invitation login return, explicit accept, siblings and future children (${mobile ? "mobile" : "desktop"})`, async ({
    page
  }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const profiles = [child("read_only"), { ...child(), contactEmail: "sibling@example.test", profileId: "sibling" }];
    const backend = await mockBackend(page, {
      managedProfiles: profiles,
      memberInvitation: { preview: preview() },
      organization: null
    });
    await page.goto(INVITATION_PATH);
    await expect(page.getByRole("link", { name: "Sign in to review" })).toBeVisible();
    await expect(page.getByText(/Invited company|inviter@example.test|Role:|Expires/)).toHaveCount(0);
    expect(backend.membershipRequests).toEqual([]);
    await page.getByRole("link", { name: "Sign in to review" }).click();
    await expect(page).toHaveURL(/\/login\?returnTo=/);
    await page.getByLabel("Email", { exact: true }).fill(E2E_USER_EMAIL);
    await page.getByRole("button", { exact: true, name: "Continue" }).click();
    await page.locator('input[autocomplete="one-time-code"]').fill("123456");
    await expect(page).toHaveURL(INVITATION_PATH);
    await expect(page.getByRole("heading", { name: "Join owner@example.test's organization" })).toBeVisible();
    await expect(page.getByText(/You can view all current and future managed profiles/)).toBeVisible();
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
    const before = await page.evaluate(async () =>
      (
        await fetch("http://localhost:3000/v1/managed-profiles", {
          headers: { Authorization: "Bearer e2e-access-token" }
        })
      ).json()
    );
    expect(before.managedProfiles).toEqual([]);
    expect(before.actor.hasMemberships).toBe(false);
    await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
    await expect(page.getByRole("heading", { exact: true, name: "Invitation accepted" })).toBeVisible();
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toHaveLength(1);
    await page.getByRole("link", { name: "View managed profiles" }).click();
    await expect(page).toHaveURL(/\/managed-profiles$/);
    await expect(page.getByText("child@example.test", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("sibling@example.test", { exact: true }).filter({ visible: true })).toBeVisible();
    profiles.push({ ...child(), contactEmail: "future@example.test", profileId: "future" });
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(page.getByText("future@example.test", { exact: true }).filter({ visible: true })).toBeVisible();
    await expect(page.getByText("Read only", { exact: true }).filter({ visible: true })).toHaveCount(3);
    expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    const inviteRequests = backend.apiRequests.filter(request => request.path.includes("/organization-member-invitations/"));
    expect(inviteRequests.every(request => request.managedProfileId === undefined)).toBe(true);
    await noOverflow(page);
    expect(backend.unmatchedRequests).toEqual([]);
    expect(backend.unexpectedExternalRequests).toEqual([]);
  });
}

test("Team requires organization membership and is unavailable during impersonation", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/team");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
  await selectChild(page, child(), true);
  await page.addInitScript(() => localStorage.removeItem("vortex_dashboard_managed_profile_selection"));
  await page.goto("/team");
  await expect(page.getByText(/Team access is unavailable during impersonation/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(0);
  await page.goto(INVITATION_PATH);
  await expect(page.getByText(/Invitations are unavailable during impersonation/)).toBeVisible();
  expect(backend.membershipRequests).toEqual([]);
});

test("live organization downgrade closes confirmation and removal updates all child access", async ({ page }) => {
  const org = organization();
  const options = {
    managedProfiles: [child(), { ...child(), profileId: "sibling" }],
    organization: org as Organization | null,
    team: { events: [], invitations: [], members: [member(), member(1)] }
  };
  const backend = await mockBackend(page, options);
  await seedSession(page);
  await page.goto("/team");
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  org.membership.role = "read_only";
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.getByRole("link", { exact: true, name: "Managed profiles" }).click();
  await expect(page.getByText("Read only", { exact: true }).filter({ visible: true })).toHaveCount(2);
  await page.getByRole("link", { exact: true, name: "Team" }).click();
  options.organization = null;
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toHaveCount(0);
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
  expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
});

test("child Team deep link is forbidden without silently clearing selection, even on bootstrap denial", async ({ page }) => {
  await mockBackend(page, { managedProfiles: [child()] });
  await page.route(`**/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}`, route =>
    route.fulfill({ json: { error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Denied" } }, status: 403 })
  );
  await selectChild(page);
  await page.goto("/team");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
  await expect(page.getByText("Acting for child@example.test")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).not.toBeNull();
});

test("live organization removal closes an open manager dialog and removes child navigation", async ({ page }) => {
  const options = { managedProfiles: [child()], organization: organization() as Organization | null };
  const backend = await mockBackend(page, options);
  await seedSession(page);
  await page.goto("/team");
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  options.organization = null;
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
  await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toHaveCount(0);
  expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("a failed role change never grants optimistic access and can be retried", async ({ page }) => {
  const target = { ...member(1), role: "read_only" as const };
  const backend = await mockBackend(page, {
    managedProfiles: [child()],
    team: { events: [], invitations: [], members: [member(), target] }
  });
  let fail = true;
  await page.route(`**/v1/organization/members/${target.memberProfileId}?*`, async route => {
    if (fail)
      await route.fulfill({ json: { error: { code: "MEMBER_NOT_FOUND", message: "Member was not found" } }, status: 409 });
    else await route.fallback();
  });
  await seedSession(page);
  await page.goto("/team");
  const row = page.getByRole("listitem", { includeHidden: true }).filter({ hasText: target.email });
  await row.getByRole("button", { name: "Change role" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Change role" }).click();
  await expect(page.getByRole("alert")).toHaveText("Member was not found");
  await expect(row.getByText("Read only", { exact: true })).toBeVisible();
  fail = false;
  await page.getByRole("dialog").getByRole("button", { name: "Change role" }).click();
  await expect(row.getByText("Manager", { exact: true })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});

for (const status of ["expired", "cancelled", "accepted"] as const) {
  test(`invitation ${status} is terminal without automatic acceptance`, async ({ page }) => {
    const data = preview();
    data.invitation.status = status;
    const backend = await mockBackend(page, { memberInvitation: { preview: data } });
    await seedSession(page);
    await page.goto(INVITATION_PATH);
    await expect(
      page.getByRole("heading", { name: status === "accepted" ? "Invitation already accepted" : `Invitation ${status}` })
    ).toBeVisible();
    await expect(page.getByRole("button", { exact: true, name: "Accept invitation" })).toHaveCount(0);
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
  });
}

for (const nowInB of [false, true]) {
  test(`accepted A invitation is historical after ${nowInB ? "joining B" : "removal"}`, async ({ page }) => {
    const accepted = preview();
    accepted.invitation.status = "accepted";
    const current = { ...organization(), ownerEmail: "owner-b@example.test", ownerProfileId: OWNER_B };
    const options = { memberInvitation: { preview: accepted }, organization: nowInB ? current : null };
    const backend = await mockBackend(page, options);
    await seedSession(page);
    await page.goto(INVITATION_PATH);
    await expect(page.getByRole("heading", { name: "Invitation already accepted" })).toBeVisible();
    await expect(page.getByText(/Reopening this link does not grant or restore membership/)).toBeVisible();
    await expect(page.getByText(/Your (current )?organization access covers/)).toHaveCount(0);
    await expect(page.getByRole("link", { exact: true, name: "View team" })).toHaveCount(0);
    await expect(page.getByRole("link", { exact: true, name: "View managed profiles" })).toHaveCount(0);
    if (nowInB) {
      await expect(
        page.getByText(/Your current organization is owner-b@example.test, not the organization from this invitation/)
      ).toBeVisible();
      await page.getByRole("link", { name: "View your current team" }).click();
      await expect(page.getByText("Organization: owner-b@example.test")).toBeVisible();
    } else {
      await expect(page.getByText("You do not currently have access to this organization.")).toBeVisible();
      await expect(page.getByRole("link", { name: /team/i })).toHaveCount(0);
    }
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
    expect(options.organization).toEqual(nowInB ? current : null);
    expect(backend.unmatchedRequests).toEqual([]);
  });
}

test("moving A to B isolates every inventory and rejects a held A invitation without retargeting", async ({
  page,
  browser
}) => {
  const offerA = preview();
  offerA.invitation.role = "manager";
  offerA.organization.ownerEmail = "owner-a@example.test";
  const offerB = preview();
  offerB.invitation = { ...invitation(), id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", ownerProfileId: OWNER_B, role: "manager" };
  offerB.organization = { ownerEmail: "owner-b@example.test", ownerProfileId: OWNER_B };
  const inventoryA = {
    managedProfiles: [{ ...child(), contactEmail: "child-a@example.test" }],
    team: {
      events: [{ ...event(0), actorProfileId: "actor-a" }],
      invitations: [offerA.invitation, { ...invitation(1), email: "pending-a@example.test" }],
      members: [{ ...member(), email: "member-a@example.test" }]
    }
  };
  const inventoryB = {
    managedProfiles: [{ ...child(), contactEmail: "child-b@example.test", profileId: "child-b" }],
    team: {
      events: [{ ...event(1), actorProfileId: "actor-b" }],
      invitations: [offerB.invitation, { ...invitation(2), email: "pending-b@example.test", ownerProfileId: OWNER_B }],
      members: [{ ...member(), email: "member-b@example.test" }]
    }
  };
  const options = {
    memberInvitation: { preview: offerA },
    organization: null as Organization | null,
    organizationInventories: { [E2E_ORGANIZATION_OWNER_ID]: inventoryA, [OWNER_B]: inventoryB }
  };
  const backend = await mockBackend(page, options);
  await seedSession(page);
  await page.goto(INVITATION_PATH);
  await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
  await page.getByRole("link", { exact: true, name: "View team" }).click();
  await expect(page.getByText("member-a@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText("pending-a@example.test", { exact: true })).toBeVisible();
  await expect(page.getByText(/Actor: actor-a/)).toBeVisible();
  await page.getByRole("link", { exact: true, name: "Managed profiles" }).click();
  await expect(page.getByRole("cell", { exact: true, name: "child-a@example.test" })).toBeVisible();
  await page.getByRole("link", { exact: true, name: "Team" }).click();
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill("stale-a-invite@example.test");
  // Simulate a background client that has not received a focus refresh while the
  // same human changes membership from a different device.
  await page.evaluate(() => {
    Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
    window.dispatchEvent(new Event("visibilitychange"));
  });

  const otherContext = await browser.newContext({ baseURL: APP_ORIGIN });
  try {
    const other = await otherContext.newPage();
    const otherBackend = await mockBackend(other, options);
    await seedSession(other);
    await other.goto("/managed-profiles");
    await other.getByRole("button", { name: "Actions for child-a@example.test" }).click();
    await other.getByRole("menuitem", { name: "Act for this profile" }).click();
    await other.getByRole("dialog").getByRole("button", { name: "Act for this profile" }).click();
    await expect(other.getByText("Acting for child-a@example.test")).toBeVisible();
    options.organization = null;
    inventoryA.team.members = inventoryA.team.members.filter(member => member.memberProfileId !== E2E_USER_ID);
    await other.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect(other.getByText("Acting for child-a@example.test")).toHaveCount(0);
    expect(await other.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    options.memberInvitation = { preview: offerB };
    await other.goto(`/member-invitations/${offerB.invitation.id}`);
    await other.getByRole("button", { exact: true, name: "Accept invitation" }).click();
    await other.getByRole("link", { exact: true, name: "View team" }).click();
    await expect(other.getByText("Organization: owner-b@example.test")).toBeVisible();
    await expect(other.getByText("member-b@example.test", { exact: true })).toBeVisible();
    await expect(other.getByText("pending-b@example.test", { exact: true })).toBeVisible();
    await expect(other.getByText(/Actor: actor-b/)).toBeVisible();
    await expect(other.getByText(/member-a@example.test|pending-a@example.test|Actor: actor-a/)).toHaveCount(0);
    expect(await other.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();

    await expect(page.getByRole("dialog")).toBeVisible();
    const rejected = page.waitForResponse(
      response =>
        new URL(response.url()).pathname === "/v1/organization/member-invitations" && response.request().method() === "POST"
    );
    await page.getByRole("dialog").getByRole("button", { name: "Send invitation" }).click();
    const response = await rejected;
    expect(response.status()).toBe(409);
    expect((await response.json()).error.code).toBe("ORGANIZATION_CONTEXT_CHANGED");
    expect(new URL(response.url()).searchParams.get("expectedOwnerProfileId")).toBe(E2E_ORGANIZATION_OWNER_ID);
    await expect(page.getByRole("dialog")).toHaveCount(0);
    await expect(page.getByText(/Your organization changed. The action was not applied/)).toBeVisible();
    await expect(page.getByText("Organization: owner-b@example.test")).toBeVisible();
    await expect(page.getByText("member-b@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText("pending-b@example.test", { exact: true })).toBeVisible();
    await expect(page.getByText(/Actor: actor-b/)).toBeVisible();
    await expect(page.getByText(/member-a@example.test|pending-a@example.test|Actor: actor-a/)).toHaveCount(0);
    await page.getByRole("link", { exact: true, name: "Managed profiles" }).click();
    await expect(page.getByRole("cell", { exact: true, name: "child-b@example.test" })).toBeVisible();
    await expect(page.getByRole("cell", { exact: true, name: "child-a@example.test" })).toHaveCount(0);
    expect(
      backend.membershipRequests.filter(
        request => request.method === "POST" && request.path === "/v1/organization/member-invitations"
      )
    ).toHaveLength(1);
    expect(
      [...inventoryA.team.invitations, ...inventoryB.team.invitations].some(
        invitation => invitation.email === "stale-a-invite@example.test"
      )
    ).toBe(false);
    expect(inventoryB.team.events).toHaveLength(1);
    for (const result of [backend, otherBackend]) {
      expect(
        result.apiRequests
          .filter(request => request.path.startsWith("/v1/organization/"))
          .every(request => request.managedProfileId === undefined)
      ).toBe(true);
      expect(result.unmatchedRequests).toEqual([]);
      expect(result.unexpectedExternalRequests).toEqual([]);
    }
  } finally {
    await otherContext.close();
  }
});

test("wrong account has no invitation details, can change login, and a preview failure retries", async ({ page }) => {
  const fixture = {
    preview: preview(),
    previewError: { code: "MANAGED_PROFILE_ACCESS_DENIED", status: 403 } as { code: string; status: number } | undefined
  };
  const backend = await mockBackend(page, { memberInvitation: fixture });
  await seedSession(page);
  await page.goto(INVITATION_PATH);
  await expect(page.getByRole("heading", { name: "Invitation unavailable for this account" })).toBeVisible();
  await expect(page.getByText(/Invited company|inviter@example.test|Role:|Expires/)).toHaveCount(0);
  await page.getByRole("button", { name: "Sign in with another account" }).click();
  await expect(page.getByRole("link", { name: "Sign in to review" })).toBeVisible();
  expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
  fixture.previewError = { code: "INTERNAL_SERVER_ERROR", status: 500 };
  await page.reload();
  await expect(page.getByRole("heading", { name: "Could not load invitation" })).toBeVisible({ timeout: 15000 });
  fixture.previewError = undefined;
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("button", { exact: true, name: "Accept invitation" })).toBeVisible();
});

test("accept-time denial hides cached preview and never sends a selected-child header", async ({ page }) => {
  const backend = await mockBackend(page, {
    managedProfiles: [child()],
    memberInvitation: { acceptError: { code: "MANAGED_PROFILE_ACCESS_DENIED", status: 403 }, preview: preview() }
  });
  await selectChild(page);
  await page.goto(INVITATION_PATH);
  await expect(page.getByRole("button", { name: "Stop acting to review invitation" })).toBeVisible();
  expect(backend.membershipRequests).toEqual([]);
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).not.toBeNull();
  await page.getByRole("button", { name: "Stop acting to review invitation" }).click();
  await expect(page.getByRole("heading", { name: "Join owner@example.test's organization" })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Invitation unavailable for this account" })).toBeVisible();
  await expect(page.getByText(/Invited company|inviter@example.test|Role:|Expires/)).toHaveCount(0);
  expect(
    backend.apiRequests
      .filter(request => request.path.includes("/organization-member-invitations/"))
      .every(request => request.managedProfileId === undefined)
  ).toBe(true);
});

test("expiry racing acceptance becomes a terminal state", async ({ page }) => {
  await mockBackend(page, {
    memberInvitation: { acceptError: { code: "INVITATION_EXPIRED", status: 409 }, preview: preview() }
  });
  await seedSession(page);
  await page.goto(INVITATION_PATH);
  await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Invitation expired" })).toBeVisible();
  await expect(page.getByRole("button", { exact: true, name: "Accept invitation" })).toHaveCount(0);
});

for (const access of ["owner", "manager", "read_only"] as const) {
  test(`second organization acceptance explains conflict for ${access} without changing access`, async ({ page }) => {
    const current = organization(access === "read_only" ? "read_only" : "manager", access === "owner");
    current.ownerProfileId = OWNER_B;
    const options = { memberInvitation: { preview: preview() }, organization: current };
    const backend = await mockBackend(page, options);
    await seedSession(page);
    await page.goto(INVITATION_PATH);
    await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
    await expect(page.getByRole("heading", { name: "You already belong to another organization" })).toBeVisible();
    await expect(page.getByRole("alert")).toContainText("Your current access has not changed");
    expect(options.organization).toBe(current);
    expect(options.memberInvitation.preview.invitation.status).toBe("pending");
    expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toHaveLength(1);
    expect(backend.unmatchedRequests).toEqual([]);
  });
}

test("a different verified OTP email cannot preview or accept the organization invitation", async ({ page }) => {
  const backend = await mockBackend(page, { memberInvitation: { preview: preview() } });
  await page.goto(INVITATION_PATH);
  await page.getByRole("link", { name: "Sign in to review" }).click();
  await page.getByLabel("Email", { exact: true }).fill("wrong@example.test");
  await page.getByRole("button", { exact: true, name: "Continue" }).click();
  await page.locator('input[autocomplete="one-time-code"]').fill("123456");
  await expect(page.getByRole("heading", { name: "Invitation unavailable for this account" })).toBeVisible();
  await expect(page.getByText(/owner@example.test|inviter@example.test|Role:|Expires/)).toHaveCount(0);
  expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("mutation denial revalidates organization authority and closes a stale manager dialog", async ({ page }) => {
  const org = organization();
  const backend = await mockBackend(page, {
    managedProfiles: [child()],
    organization: org,
    team: { events: [], invitations: [], members: [member(), member(1)] }
  });
  await seedSession(page);
  await page.goto("/team");
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  await page.getByRole("dialog").getByLabel("Email").fill("invitee@example.test");
  org.membership.role = "read_only";
  await page.getByRole("dialog").getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
  await expect(page.getByRole("button", { name: /Invite member|Change role|Remove member/ })).toHaveCount(0);
  await page.getByRole("link", { exact: true, name: "Managed profiles" }).click();
  await expect(page.getByRole("cell", { exact: true, name: "Read only" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});

test("organization refresh errors hide cached manager controls and allow a safe retry", async ({ page }) => {
  const backend = await mockBackend(page, { organization: organization() });
  await seedSession(page);
  await page.goto("/team");
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  let denied = true;
  await page.route("**/v1/organization", async route => {
    if (denied)
      await route.fulfill({ json: { error: { code: "ORGANIZATION_ACCESS_DENIED", message: "Denied" } }, status: 403 });
    else await route.fallback();
  });
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Could not confirm your organization access.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(0);
  denied = false;
  await page.getByRole("button", { name: "Retry organization access" }).click();
  await expect(page.getByRole("button", { exact: true, name: "Invite member" })).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
});

test("login ignores an unsafe return destination", async ({ page }) => {
  await mockBackend(page);
  await seedSession(page);
  await page.goto("/login?returnTo=https%3A%2F%2Fevil.test");
  await expect(page).toHaveURL(/\/overview$/);
});

for (const action of ["Change role", "Remove member"]) {
  test(`confirming your own ${action.toLowerCase()} refreshes live membership`, async ({ page }) => {
    const self = { ...member(1), email: E2E_USER_EMAIL, memberProfileId: E2E_USER_ID };
    const backend = await mockBackend(page, {
      managedProfiles: [child()],
      team: { events: [], invitations: [], members: [member(), self] }
    });
    await seedSession(page);
    await page.goto("/team");
    await page.getByRole("button", { exact: true, name: action }).click();
    await page.getByRole("dialog").getByRole("button", { exact: true, name: action }).click();
    if (action === "Change role") {
      await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
      await expect(page.getByRole("button", { name: /Invite member|Change role|Remove member/ })).toHaveCount(0);
    } else {
      await expect(page).toHaveURL(/\/overview$/);
      expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    }
    expect(backend.unmatchedRequests).toEqual([]);
  });
}

test("role grants wait for the server and Team read failures can be retried", async ({ page }) => {
  const target = { ...member(1), role: "read_only" as const };
  const backend = await mockBackend(page, {
    managedProfiles: [child()],
    team: { events: [], invitations: [], members: [member(), target] }
  });
  const response = Promise.withResolvers<void>();
  let requested = false;
  await page.route(`**/v1/organization/members/${target.memberProfileId}?*`, async route => {
    requested = true;
    await response.promise;
    await route.fallback();
  });
  let failRead = true;
  await page.route("**/v1/organization/members?*", async route => {
    if (failRead) await route.fulfill({ json: { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" } }, status: 500 });
    else await route.fallback();
  });
  await seedSession(page);
  await page.goto("/team");
  await expect(page.getByText("Could not load members.")).toBeVisible({ timeout: 15000 });
  failRead = false;
  await page.getByRole("button", { name: "Retry members" }).click();
  const row = page.getByRole("listitem", { includeHidden: true }).filter({ hasText: target.email });
  await row.getByRole("button", { name: "Change role" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Change role" }).click();
  await expect.poll(() => requested).toBe(true);
  await expect(page.getByRole("button", { exact: true, name: "Updating..." })).toBeDisabled();
  await expect(row.getByText("Read only", { exact: true })).toBeVisible();
  response.resolve();
  await expect(row.getByText("Manager", { exact: true })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});

test("an unconfirmed acceptance retries preview instead of accepting twice", async ({ page }) => {
  const fixture = { acceptError: { code: "INTERNAL_SERVER_ERROR", status: 500 }, preview: preview() };
  const backend = await mockBackend(page, { memberInvitation: fixture });
  await seedSession(page);
  await page.goto(INVITATION_PATH);
  await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Could not load invitation" })).toBeVisible();
  fixture.preview.invitation.status = "accepted";
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Invitation already accepted" })).toBeVisible();
  expect(backend.membershipRequests.filter(request => request.method === "POST")).toHaveLength(1);
  await expect(page.getByText("You do not currently have access to this organization.")).toBeVisible();
  await page.getByRole("link", { name: "Return to your dashboard" }).click();
  await expect(page).toHaveURL(/\/overview$/);
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
});

for (const reason of ["owner disabled", "child deleted"] as const) {
  test(`read-only bootstrap clears selection when ${reason}`, async ({ page }) => {
    const profile = child("read_only");
    const options = { managedProfileOwnerActive: true, managedProfiles: [profile] };
    const backend = await mockBackend(page, options);
    await selectChild(page, profile);
    await page.goto("/overview");
    await expect(page.getByText("Acting for child@example.test")).toBeVisible();
    if (reason === "owner disabled") options.managedProfileOwnerActive = false;
    else profile.status = "deleted";
    const bootstrapResponse = page.waitForResponse(
      response => new URL(response.url()).pathname === `/v1/managed-profiles/${profile.profileId}` && response.status() === 403
    );
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    const response = await bootstrapResponse;
    expect(response.request().headers()["x-managed-profile-id"]).toBe(profile.profileId);
    expect((await response.json()).error.code).toBe("MANAGED_PROFILE_MEMBERSHIP_INVALID");
    await expect(page).toHaveURL(reason === "owner disabled" ? /\/overview$/ : /\/managed-profiles$/);
    expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    await expect(page.getByText("Acting for child@example.test")).toHaveCount(0);
    if (reason === "owner disabled") {
      await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toHaveCount(0);
      await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
    } else {
      await expect(page.getByRole("link", { exact: true, name: "Team" })).toBeVisible();
      await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
    }
    expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
    expect(backend.unmatchedRequests).toEqual([]);
  });
}

test("child credential scope and survival warning fits the mobile creation dialog", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  const backend = await mockBackend(page, { managedProfiles: [child()] });
  await selectChild(page);
  await page.goto("/api-keys");
  await expect(
    page.getByText(/shared company principal for supported provider, fiat-account, quote, and ramp operations/)
  ).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Create credential" }).click();
  const dialog = page.getByRole("dialog");
  await expect(
    dialog.getByText(/shared company principal for supported provider, fiat-account, quote, and ramp operations/)
  ).toBeVisible();
  await expect(dialog.getByText(/remain valid after a human member is removed or downgraded/)).toBeVisible();
  await expect(dialog.getByRole("button", { exact: true, name: "Create credential" })).toBeInViewport();
  await noOverflow(page);
  expect(backend.apiCredentialRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
});
