import { expect, test } from "@playwright/test";
import { E2E_MANAGED_PROFILE_ID, mockBackend } from "./support/mockBackend";
import { E2E_USER_ID, seedSession } from "./support/session";

const CHILD_EMAIL = "managed-child-with-a-long-identifier@example.test";
const CHILD_EXTERNAL_ID = `customer-${"long-identifier-".repeat(8)}`;
const CHILD = {
  contactEmail: CHILD_EMAIL,
  customerType: "individual" as const,
  externalSubjectId: CHILD_EXTERNAL_ID,
  membership: { isOwner: true, role: "manager" as const },
  policy: { allowedCorridors: ["MX" as const], allowedCustomerTypes: null },
  profileId: E2E_MANAGED_PROFILE_ID,
  status: "active" as const
};

test("ordinary users cannot navigate to managed profiles", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  const listResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/v1/managed-profiles");
  await page.goto("/overview");

  const response = await listResponse;
  expect(response.status()).toBe(200);
  expect((await response.json()).actor).toEqual({
    canProvisionManagedProfiles: false,
    hasMemberships: false,
    profileId: E2E_USER_ID
  });

  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Managed profiles" })).toHaveCount(0);

  await page.goto("/managed-profiles");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("a manager selects and stops acting for a managed profile", async ({ page }) => {
  const backend = await mockBackend(page, { managedProfiles: [CHILD], onboardingState: "started", roles: ["vortex_admin"] });
  await seedSession(page);
  await page.goto("/managed-profiles");

  await expect(page.getByRole("heading", { name: "Managed profiles" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Managed profiles" })).toBeVisible();
  await page.getByRole("button", { name: `Actions for ${CHILD_EMAIL}` }).click();
  await page.getByRole("menuitem", { name: "Act for this profile" }).click();

  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: `Act for ${CHILD_EMAIL}?` })).toBeVisible();
  await dialog.getByRole("button", { name: "Act for this profile" }).click();

  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByText(`Acting for ${CHILD_EMAIL}`)).toBeVisible();
  await expect(page.getByText("Manager", { exact: true })).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toBeVisible();
  await expect(page.getByText("KYC/KYB is read-only while acting for another profile.")).toBeVisible();
  await expect(page.getByRole("button", { name: "KYC is read-only while acting" })).toBeDisabled();
  await page.goto("/overview?onboarding=MX");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(`Acting for ${CHILD_EMAIL}`)).toBeVisible();

  await expect(page.getByRole("link", { name: "API keys" })).toBeVisible();
  await expect(page.getByRole("link", { name: "New transfer" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Managed profiles" })).toHaveCount(0);

  await page.goto("/api-keys");
  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await expect(
    page.getByText(/shared company principal for supported provider, fiat-account, quote, and ramp operations/)
  ).toBeVisible();
  await expect(page.getByText(/remain valid after a human member is removed or downgraded/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Create credential" })).toBeVisible();
  await expect(page.getByText("No API credentials yet")).toBeVisible();
  await page.getByRole("button", { name: "Create credential" }).click();
  const createCredentialDialog = page.getByRole("dialog");
  await expect(
    createCredentialDialog.getByText(
      /shared company principal for supported provider, fiat-account, quote, and ramp operations/
    )
  ).toBeVisible();
  await expect(createCredentialDialog.getByText(/remain valid after a human member is removed or downgraded/)).toBeVisible();
  await createCredentialDialog.getByLabel("Name").fill("Child backend");
  await createCredentialDialog.getByRole("button", { name: "Create credential" }).click();
  await createCredentialDialog.getByLabel("I saved the secret key").click();
  await createCredentialDialog.getByRole("button", { name: "Done" }).click();
  await page.getByRole("button", { name: "Revoke Child backend" }).click();
  await expect(
    page
      .getByRole("dialog")
      .getByText(/shared company principal for supported provider, fiat-account, quote, and ramp operations/)
  ).toBeVisible();
  await expect(page.getByRole("dialog").getByText(/remain valid after a human member is removed or downgraded/)).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Revoke credential" }).click();
  expect(
    backend.apiRequests.some(
      request => request.path === `/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/api-credentials` && request.method === "GET"
    )
  ).toBe(true);
  expect(backend.apiCredentialRequests.map(request => `${request.method} ${request.path}`)).toEqual([
    `POST /v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/api-credentials`,
    `DELETE /v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}/api-credentials/credential-e2e-1`
  ]);

  await page.goto("/transfer");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "New transfer" })).toHaveCount(0);

  const delegatedStatuses = backend.apiRequests.filter(request => request.path === "/v1/onboarding/status");
  expect(delegatedStatuses.some(request => request.managedProfileId === E2E_MANAGED_PROFILE_ID)).toBe(true);
  const lifecycleRequests = backend.apiRequests.filter(request => request.path === "/v1/managed-profiles");
  expect(lifecycleRequests.length).toBeGreaterThan(0);
  expect(lifecycleRequests.every(request => request.managedProfileId === undefined)).toBe(true);

  await page.getByRole("button", { name: "Stop acting" }).click();
  await expect(page).toHaveURL(/\/managed-profiles$/);
  await expect(page.getByRole("heading", { name: "Managed profiles" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("read-only child membership keeps reads but removes mutations and transfer entry points", async ({ page }) => {
  const backend = await mockBackend(page, {
    managedProfiles: [
      {
        ...CHILD,
        membership: { isOwner: false, role: "read_only" }
      }
    ],
    pendingInvitations: [
      {
        alias: "Read-only recipient",
        country: "MX",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        id: "readonly-invite",
        inviteeEmail: null,
        inviteeType: "individual",
        isExpired: false,
        payoutCurrency: "mxn",
        rail: "mxn",
        token: "readonly-token"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/managed-profiles");
  await page.getByRole("button", { name: `Actions for ${CHILD_EMAIL}` }).click();
  await page.getByRole("menuitem", { name: "Act for this profile" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Act for this profile" }).click();

  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  await expect(page.getByText("Owner", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "New transfer" })).toHaveCount(0);

  await page.goto("/api-keys");
  await expect(page.getByText("Credentials are read-only for this membership.")).toBeVisible();
  await expect(
    page.getByText(/shared company principal for supported provider, fiat-account, quote, and ramp operations/)
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Create credential" })).toHaveCount(0);

  await page.goto("/recipients");
  await expect(page.getByText("Recipient management is read-only for this membership.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Add recipient" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Create transfer" })).toHaveCount(0);
  await page.getByRole("cell", { name: "Read-only recipient" }).click();
  await expect(page.getByRole("button", { name: "Remove from list" })).toHaveCount(0);
  await page.keyboard.press("Escape");

  await page.goto("/quote");
  await page.getByRole("tab", { name: "Sell crypto" }).click();
  await page.getByLabel("Fiat currency").click();
  await page.getByRole("option", { name: /MXN/ }).click();
  await page.getByLabel("You pay").fill("10");
  await expect(page.getByText("New transfers are unavailable while acting for a managed profile.")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("link", { name: "Continue to transfer" })).toHaveCount(0);

  await page.goto("/transactions");
  await expect(page.getByRole("link", { name: /Start a transfer|Start a pay-in/ })).toHaveCount(0);
  await page.goto("/transfer");
  await expect(page).toHaveURL(/\/overview$/);

  const card = page.getByTestId("corridor-card-MX");
  await card.getByRole("button", { name: "View pay-out accounts" }).click();
  await expect(page.getByRole("button", { name: /Remove account|Add another account/ })).toHaveCount(0);
  expect(backend.archiveInvitationRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("open recipient and payout controls close when the membership is downgraded", async ({ page }) => {
  const child = {
    ...CHILD,
    membership: { isOwner: true, role: "manager" as "manager" | "read_only" }
  };
  const backend = await mockBackend(page, {
    managedProfiles: [child],
    pendingInvitations: [
      {
        alias: "Downgrade recipient",
        country: "MX",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        id: "downgrade-invite",
        inviteeEmail: null,
        inviteeType: "individual",
        isExpired: false,
        payoutCurrency: "mxn",
        rail: "mxn",
        token: "downgrade-token"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/managed-profiles");
  await page.getByRole("button", { name: `Actions for ${CHILD_EMAIL}` }).click();
  await page.getByRole("menuitem", { name: "Act for this profile" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Act for this profile" }).click();

  async function refreshMembership() {
    const previousReads = backend.apiRequests.filter(
      request => request.path === `/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}`
    ).length;
    await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
    await expect
      .poll(
        () => backend.apiRequests.filter(request => request.path === `/v1/managed-profiles/${E2E_MANAGED_PROFILE_ID}`).length
      )
      .toBeGreaterThan(previousReads);
  }

  await page.goto("/recipients");
  await page.getByRole("cell", { name: "Downgrade recipient" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  child.membership = { isOwner: false, role: "read_only" };
  await refreshMembership();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Recipient management is read-only for this membership.")).toBeVisible();

  child.membership = { isOwner: true, role: "manager" };
  await refreshMembership();
  await page.goto("/overview");
  await page.getByTestId("corridor-card-MX").getByRole("button", { name: "View pay-out accounts" }).click();
  await page.getByRole("button", { name: "Add another account" }).click();
  await expect(page.getByRole("heading", { name: "Add pay-out account" })).toBeVisible();
  child.membership = { isOwner: false, role: "read_only" };
  await refreshMembership();
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(page.getByText("Read only", { exact: true })).toBeVisible();
  expect(backend.archiveInvitationRequests).toEqual([]);
  expect(backend.fiatAccountRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("only the child bootstrap membership-invalid response clears persisted child mode", async ({ page }) => {
  await mockBackend(page, { previousManagedProfileIds: [E2E_MANAGED_PROFILE_ID] });
  await seedSession(page);
  await page.addInitScript(
    ({ managedProfileId, managerProfileId }) => {
      localStorage.setItem(
        "vortex_dashboard_managed_profile_selection",
        JSON.stringify({
          customerType: "individual",
          externalSubjectId: "removed-child",
          isOwner: false,
          managerProfileId,
          membershipRole: "read_only",
          targetEmail: "removed@example.test",
          targetProfileId: managedProfileId
        })
      );
    },
    { managedProfileId: E2E_MANAGED_PROFILE_ID, managerProfileId: E2E_USER_ID }
  );

  await page.goto("/overview");
  await expect.poll(() => page.evaluate(() => localStorage.getItem("vortex_dashboard_managed_profile_selection"))).toBeNull();
  await expect(page.getByText("Acting for removed@example.test")).toHaveCount(0);
});

test("admin impersonation keeps verification status visible but blocks onboarding deep links", async ({ page }) => {
  await mockBackend(page, { onboardingState: "started" });
  await seedSession(page);
  await page.addInitScript(() => {
    localStorage.setItem(
      "vortex_dashboard_impersonation_session",
      JSON.stringify({
        expiresAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
        sessionId: "impersonation-e2e-1",
        targetEmail: "target@example.test",
        targetProfileId: "target-e2e-1",
        token: "vtx_imp_e2e-token"
      })
    );
  });

  await page.goto("/overview?onboarding=MX");

  await expect(page.getByText("You are acting as")).toBeVisible();
  await expect(page.getByText("KYC/KYB is read-only while acting for another profile.")).toBeVisible();
  await expect(page.getByText("Started", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "KYC is read-only while acting" })).toBeDisabled();
  await expect(page.getByRole("dialog")).toHaveCount(0);
});

test("long managed identifiers and the acting banner fit a mobile viewport", async ({ page }) => {
  await page.setViewportSize({ height: 844, width: 390 });
  await mockBackend(page, { managedProfiles: [CHILD] });
  await seedSession(page);
  await page.goto("/managed-profiles");

  const action = page.getByRole("button", { name: `Actions for ${CHILD_EMAIL}` });
  await expect(action).toBeVisible();
  await action.click();
  await page.getByRole("menuitem", { name: "Act for this profile" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Act for this profile" }).click();
  await expect(page.getByText(`Acting for ${CHILD_EMAIL}`)).toBeVisible();

  const dimensions = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth
  }));
  expect(dimensions.scrollWidth).toBeLessThanOrEqual(dimensions.clientWidth);
  await expect(page.getByRole("button", { name: "Stop acting" })).toBeVisible();
});

for (const mobile of [false, true]) {
  for (const hasMemberships of [false, true]) {
    test(`provisioning actor retains navigation with ${hasMemberships ? "active" : "no"} memberships (${mobile ? "mobile" : "desktop"})`, async ({
      page
    }) => {
      if (mobile) await page.setViewportSize({ height: 844, width: 390 });
      const backend = await mockBackend(page, {
        canProvisionManagedProfiles: true,
        managedProfiles: hasMemberships ? [CHILD] : []
      });
      await seedSession(page);
      await page.goto("/managed-profiles");
      await expect(page.getByRole("heading", { name: "Managed profiles" })).toBeVisible();
      if (!hasMemberships) {
        await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
        await expect(page.getByText(/You can provision managed profiles through the API/)).toBeVisible();
      }
      if (mobile) await page.getByRole("button", { name: "Toggle Sidebar" }).first().click();
      await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toBeVisible();
      expect(backend.unmatchedRequests).toEqual([]);
    });
  }
}

test("membership navigation survives an empty paginated page", async ({ page }) => {
  const profiles = Array.from({ length: 21 }, (_, index) => ({
    ...CHILD,
    contactEmail: `child-${index}@example.test`,
    membership: { isOwner: false, role: "read_only" as const },
    profileId: `child-${index}`
  }));
  const backend = await mockBackend(page, { managedProfiles: profiles });
  await seedSession(page);
  await page.goto("/managed-profiles");
  await page.getByRole("button", { exact: true, name: "Next" }).click();
  await expect(page.getByRole("cell", { exact: true, name: "child-20@example.test" })).toBeVisible();
  profiles.splice(20, 1);
  const listResponse = page.waitForResponse(response => {
    const url = new URL(response.url());
    return url.pathname === "/v1/managed-profiles" && url.searchParams.get("offset") === "20";
  });
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  const result = await (await listResponse).json();
  expect(result.managedProfiles).toEqual([]);
  expect(result.actor).toEqual({ canProvisionManagedProfiles: false, hasMemberships: true, profileId: E2E_USER_ID });
  await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toBeVisible();
  await expect(page).toHaveURL(/\/managed-profiles$/);
  await page.getByRole("button", { exact: true, name: "Previous" }).click();
  await expect(page.getByRole("cell", { exact: true, name: "child-0@example.test" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});

test("own provisioning access is independent of an inactive controlling owner", async ({ page }) => {
  const backend = await mockBackend(page, {
    canProvisionManagedProfiles: true,
    managedProfileOwnerActive: false,
    managedProfiles: [{ ...CHILD, membership: { isOwner: false, role: "read_only" } }]
  });
  await seedSession(page);
  const listResponse = page.waitForResponse(response => new URL(response.url()).pathname === "/v1/managed-profiles");
  await page.goto("/managed-profiles");
  expect((await (await listResponse).json()).actor).toEqual({
    canProvisionManagedProfiles: true,
    hasMemberships: false,
    profileId: E2E_USER_ID
  });
  await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
  await expect(page.getByRole("link", { exact: true, name: "Managed profiles" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});

test("list errors remain retryable UI rather than ordinary-user capability detection", async ({ page }) => {
  await mockBackend(page, { canProvisionManagedProfiles: true });
  let fail = true;
  await page.route("**/v1/managed-profiles?*", async route => {
    if (fail) await route.fulfill({ json: { code: "MANAGED_PROFILE_ACCESS_DENIED", message: "Denied" }, status: 403 });
    else await route.fallback();
  });
  await seedSession(page);
  await page.goto("/managed-profiles");
  await expect(page.getByText(/Could not load managed profiles/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Retry profile access" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { exact: true, name: "Try again" }).click();
  await expect(page.getByText("No managed profiles", { exact: true })).toBeVisible();
});
