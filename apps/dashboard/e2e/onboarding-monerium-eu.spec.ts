import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { E2E_USER_EMAIL, E2E_USER_ID, SESSION_KEYS, seedSession } from "./support/session";

test("Monerium EU OAuth returns securely and refreshes approval", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  await seedSession(page);
  await page.goto("/overview");

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
  await page.route(`${new URL(page.url()).origin}/monerium/callback?**`, async route => {
    await navigationGate;
    await route.continue();
  });
  const connectingShown = page.evaluate(
    () =>
      new Promise<boolean>(resolve => {
        const observer = new MutationObserver(() => {
          if (document.body.textContent?.includes("Connecting to Monerium")) {
            observer.disconnect();
            resolve(true);
          }
        });
        observer.observe(document.body, { childList: true, subtree: true });
      })
  );
  const navigation = wizard.getByRole("button", { name: "Continue to Monerium" }).click();
  try {
    await expect(connectingShown).resolves.toBe(true);
  } finally {
    continueNavigation();
  }
  await navigation;

  await expect(page).toHaveURL(/\/overview\?onboarding=EU$/, { timeout: 20_000 });
  await expect(page.getByRole("dialog").getByText("Verification in review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue in background" })).toBeVisible();
  expect(backend.monerium.startRequests).toEqual([{ customerType: "individual" }]);

  await page.getByRole("button", { name: "Continue in background" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
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

  await page.goto("/monerium/callback?code=e2e-code&state=e2e-state");

  await expect(page).toHaveURL(/\/overview\?onboarding=EU$/, { timeout: 20_000 });
  await expect(page.getByRole("dialog").getByText("Verification in review")).toBeVisible();
  expect(backend.auth.refreshes).toBe(1);
});

test("in-review Monerium onboarding offers reauthentication when the status response requires it", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  backend.monerium.completed = true;
  await seedSession(page);
  await page.goto("/overview");

  const reauthenticateButton = page.getByRole("button", { name: "Re-authenticate with Monerium" });
  await expect(reauthenticateButton).toBeVisible({ timeout: 20_000 });
  await reauthenticateButton.click();

  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("Verify with Monerium")).toBeVisible();
  await expect(wizard.getByRole("button", { name: "Continue to Monerium" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
});
