import { expect, type Page, test } from "@playwright/test";
import type {
  InvitationPreview,
  MemberEvent,
  MemberInvitation,
  TeamMember
} from "../src/services/api/managed-profile-memberships.service";
import type { ManagedProfile } from "../src/services/api/managed-profiles.service";
import { E2E_MANAGED_PROFILE_ID, mockBackend } from "./support/mockBackend";
import { E2E_USER_EMAIL, E2E_USER_ID, seedSession } from "./support/session";

const INVITATION_ID = "12345678-1234-1234-1234-123456789abc";
const INVITATION_PATH = `/member-invitations/${INVITATION_ID}`;
const NOW = "2026-09-01T12:00:00.000Z";

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
    invitedByProfileId: "owner",
    managedProfileId: E2E_MANAGED_PROFILE_ID,
    role: "read_only",
    status: "pending"
  };
}
function preview(): InvitationPreview {
  return {
    invitation: invitation(),
    inviter: { email: "inviter@example.test", profileId: "owner" },
    managedProfile: { externalSubjectId: "Invited company", profileId: E2E_MANAGED_PROFILE_ID }
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
      managedProfiles: [child()],
      team: { events: [], invitations: [], members: [member(), teammate] }
    });
    await selectChild(page);
    await page.goto("/team");
    await expect(page.getByRole("heading", { exact: true, name: "Team" })).toBeVisible();
    if (!mobile) await expect(page.getByRole("link", { exact: true, name: "Team" })).toBeVisible();
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
    await noOverflow(page);
    expect(backend.unmatchedRequests).toEqual([]);
    expect(backend.unexpectedExternalRequests).toEqual([]);
  });

  test(`read-only Team paginates every list without mutation UI (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const profile = child("read_only");
    const backend = await mockBackend(page, {
      managedProfiles: [profile],
      team: {
        events: Array.from({ length: 21 }, (_, i) => event(i)),
        invitations: Array.from({ length: 21 }, (_, i) => invitation(i)),
        members: Array.from({ length: 21 }, (_, i) => member(i))
      }
    });
    await selectChild(page, profile);
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

  test(`invitation login return, explicit accept, and open child (${mobile ? "mobile" : "desktop"})`, async ({ page }) => {
    if (mobile) await page.setViewportSize({ height: 844, width: 390 });
    const backend = await mockBackend(page, {
      managedProfiles: [child("read_only")],
      memberInvitation: { preview: preview() }
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
    await expect(page.getByRole("heading", { name: "Join Invited company" })).toBeVisible();
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toEqual([]);
    await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
    await expect(page.getByRole("heading", { exact: true, name: "Invitation accepted" })).toBeVisible();
    expect(backend.membershipRequests.filter(request => request.method === "POST")).toHaveLength(1);
    await page.getByRole("button", { name: "Open profile" }).click();
    await expect(page).toHaveURL(/\/overview$/);
    await expect(page.getByText("Acting for child@example.test")).toBeVisible();
    await expect(page.getByText("Read only", { exact: true })).toBeVisible();
    const inviteRequests = backend.apiRequests.filter(request => request.path.includes("/managed-profile-member-invitations/"));
    expect(inviteRequests.every(request => request.managedProfileId === undefined)).toBe(true);
    await noOverflow(page);
    expect(backend.unmatchedRequests).toEqual([]);
    expect(backend.unexpectedExternalRequests).toEqual([]);
  });
}

test("Team requires child selection and is unavailable during impersonation", async ({ page }) => {
  const backend = await mockBackend(page, { managedProfiles: [child()] });
  await seedSession(page);
  await page.goto("/team");
  await expect(page).toHaveURL(/\/managed-profiles$/);
  await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
  await selectChild(page, child(), true);
  await page.goto("/team");
  await expect(page.getByText(/Team access is unavailable during impersonation/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Invite member" })).toHaveCount(0);
  await page.goto(INVITATION_PATH);
  await expect(page.getByText(/Invitations are unavailable during impersonation/)).toBeVisible();
  expect(backend.membershipRequests).toEqual([]);
});

test("live Team downgrade closes confirmation and removal clears selection", async ({ page }) => {
  const profile = child();
  const profiles = [profile];
  const backend = await mockBackend(page, {
    managedProfiles: profiles,
    team: { events: [], invitations: [], members: [member(), member(1)] }
  });
  await selectChild(page, profile);
  await page.goto("/team");
  await page.getByRole("button", { exact: true, name: "Invite member" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  profile.membership.role = "read_only";
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  profiles.splice(0, 1);
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect(page).toHaveURL(/\/overview$/);
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
  expect(backend.membershipRequests.every(request => request.method === "GET")).toBe(true);
});

test("generic bootstrap denial does not clear child selection", async ({ page }) => {
  await mockBackend(page, { managedProfiles: [child()] });
  await page.route(`**/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}`, route =>
    route.fulfill({ json: { error: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Denied" } }, status: 403 })
  );
  await selectChild(page);
  await page.goto("/team");
  await expect(page.getByRole("heading", { exact: true, name: "Team" })).toBeVisible();
  await expect(page.getByText("Acting for child@example.test")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).not.toBeNull();
});

test("a failed role change never grants optimistic access and can be retried", async ({ page }) => {
  const target = { ...member(1), role: "read_only" as const };
  const backend = await mockBackend(page, {
    managedProfiles: [child()],
    team: { events: [], invitations: [], members: [member(), target] }
  });
  let fail = true;
  await page.route(`**/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/members/${target.memberProfileId}`, async route => {
    if (fail)
      await route.fulfill({ json: { error: { code: "MEMBER_NOT_FOUND", message: "Member was not found" } }, status: 409 });
    else await route.fallback();
  });
  await selectChild(page);
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
  await expect(page.getByRole("heading", { name: "Join Invited company" })).toBeVisible();
  await page.getByRole("button", { exact: true, name: "Accept invitation" }).click();
  await expect(page.getByRole("heading", { name: "Invitation unavailable for this account" })).toBeVisible();
  await expect(page.getByText(/Invited company|inviter@example.test|Role:|Expires/)).toHaveCount(0);
  expect(
    backend.apiRequests
      .filter(request => request.path.includes("/managed-profile-member-invitations/"))
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
    await selectChild(page);
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
  await page.route(`**/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/members/${target.memberProfileId}`, async route => {
    requested = true;
    await response.promise;
    await route.fallback();
  });
  let failRead = true;
  await page.route(`**/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/members?*`, async route => {
    if (failRead) await route.fulfill({ json: { error: { code: "INTERNAL_SERVER_ERROR", message: "Failed" } }, status: 500 });
    else await route.fallback();
  });
  await selectChild(page);
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
  await page.getByRole("button", { name: "Open profile" }).click();
  await expect(page.getByRole("alert")).toContainText("Your membership may have changed");
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
});

for (const reason of ["owner disabled", "child deleted"] as const) {
  test(`read-only bootstrap clears selection when ${reason}`, async ({ page }) => {
    const profile = child("read_only");
    const options = { managedProfileOwnerActive: true, managedProfiles: [profile] };
    const backend = await mockBackend(page, options);
    await selectChild(page, profile);
    await page.goto("/team");
    await expect(page.getByText("Team access is read-only for this membership.")).toBeVisible();
    if (reason === "owner disabled") options.managedProfileOwnerActive = false;
    else profile.status = "deleted";
    const bootstrapResponse = page.waitForResponse(
      response => new URL(response.url()).pathname === `/v1/managed-profiles/${profile.profileId}` && response.status() === 403
    );
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    const response = await bootstrapResponse;
    expect(response.request().headers()["x-managed-profile-id"]).toBe(profile.profileId);
    expect((await response.json()).error.code).toBe("MANAGED_PROFILE_MEMBERSHIP_INVALID");
    await expect(page).toHaveURL(/\/overview$/);
    expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
    await expect(page.getByText("Acting for child@example.test")).toHaveCount(0);
    await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toHaveCount(0);
    await expect(page.getByRole("link", { exact: true, name: "Team" })).toHaveCount(0);
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
