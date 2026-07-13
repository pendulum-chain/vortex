import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { E2E_USER_EMAIL, E2E_USER_ID, SESSION_KEYS, seedSession } from "./support/session";

test("Monerium EU OAuth returns securely and refreshes approval", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  await seedSession(page);
  await page.goto("/dashboard/overview");

  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Europe/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  await page.getByRole("button", { name: "Start KYC" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("Verify with Monerium")).toBeVisible({ timeout: 20_000 });
  let continueNavigation: () => void;
  const navigationGate = new Promise<void>(resolve => {
    continueNavigation = resolve;
  });
  await page.route(`${page.url().split("/dashboard/")[0]}/dashboard/monerium/callback?**`, async route => {
    await navigationGate;
    await route.continue();
  });
  const navigation = wizard.getByRole("button", { name: "Continue to Monerium" }).click();
  try {
    await expect(wizard.getByText("Connecting to Monerium")).toBeVisible();
  } finally {
    continueNavigation();
  }
  await navigation;

  await expect(page.getByText("Verification in review")).toBeVisible({ timeout: 20_000 });
  await expect.poll(() => new URL(page.url()).search).toBe("");
  expect(backend.monerium.startRequests).toEqual([{ customerType: "individual" }]);

  await page.getByRole("button", { name: "Return to dashboard" }).click();
  await expect(page.getByRole("button", { name: "Awaiting provider review" })).toBeVisible({ timeout: 20_000 });

  backend.monerium.approved = true;
  await expect(page.getByRole("button", { name: "Verification complete" })).toBeVisible({ timeout: 25_000 });
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Monerium callback refreshes an expired dashboard session before exchange", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true, moneriumRequireRefresh: true });
  await page.addInitScript(
    ({ email, keys, userId }) => {
      localStorage.setItem(keys.accessToken, "eyJhbGciOiJub25lIn0.eyJleHAiOjF9.");
      localStorage.setItem(keys.refreshToken, "e2e-refresh-token");
      localStorage.setItem(keys.userId, userId);
      localStorage.setItem(keys.userEmail, email);
    },
    { email: E2E_USER_EMAIL, keys: SESSION_KEYS, userId: E2E_USER_ID }
  );

  await page.goto("/dashboard/monerium/callback?code=e2e-code&state=e2e-state");

  await expect(page.getByText("Verification in review")).toBeVisible({ timeout: 20_000 });
  expect(backend.auth.refreshes).toBe(1);
  await expect.poll(() => new URL(page.url()).search).toBe("");
});
