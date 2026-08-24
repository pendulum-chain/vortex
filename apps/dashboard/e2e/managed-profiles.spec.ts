import { expect, test } from "@playwright/test";
import { E2E_MANAGED_PROFILE_ID, mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

const CHILD_EMAIL = "managed-child-with-a-long-identifier@example.test";
const CHILD_EXTERNAL_ID = `customer-${"long-identifier-".repeat(8)}`;
const CHILD = {
  contactEmail: CHILD_EMAIL,
  customerType: "individual" as const,
  externalSubjectId: CHILD_EXTERNAL_ID,
  profileId: E2E_MANAGED_PROFILE_ID
};

test("ordinary users cannot navigate to managed profiles", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/overview");

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
  await expect(page.getByText("KYC/KYB is read-only while acting for another profile.")).toBeVisible();
  await expect(page.getByRole("button", { name: "KYC is read-only while acting" })).toBeDisabled();
  await page.goto("/overview?onboarding=MX");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await page.reload();
  await expect(page.getByText(`Acting for ${CHILD_EMAIL}`)).toBeVisible();

  await expect(page.getByRole("link", { name: "API keys" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Settings" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Managed profiles" })).toHaveCount(0);

  await page.waitForLoadState("networkidle");
  const apiCredentialRequestCount = backend.apiRequests.filter(request => request.path === "/v1/api-credentials").length;
  await page.goto("/api-keys");
  await expect(page).toHaveURL(/\/overview$/);
  await expect(page.getByRole("heading", { name: "API keys" })).toHaveCount(0);

  const delegatedStatuses = backend.apiRequests.filter(request => request.path === "/v1/onboarding/status");
  expect(delegatedStatuses.some(request => request.managedProfileId === E2E_MANAGED_PROFILE_ID)).toBe(true);
  const lifecycleRequests = backend.apiRequests.filter(request => request.path === "/v1/managed-profiles");
  expect(lifecycleRequests.length).toBeGreaterThan(0);
  expect(lifecycleRequests.every(request => request.managedProfileId === undefined)).toBe(true);
  expect(backend.apiRequests.filter(request => request.path === "/v1/api-credentials")).toHaveLength(apiCredentialRequestCount);

  await page.getByRole("button", { name: "Stop acting" }).click();
  await expect(page).toHaveURL(/\/managed-profiles$/);
  await expect(page.getByRole("heading", { name: "Managed profiles" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
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
