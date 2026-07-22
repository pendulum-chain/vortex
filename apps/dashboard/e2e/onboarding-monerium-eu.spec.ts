import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { E2E_USER_EMAIL, E2E_USER_ID, SESSION_KEYS, seedSession } from "./support/session";

// EU onboarding (KYC and KYB) is temporarily disabled: the corridor card must not offer any
// actionable button and the wizard must refuse the corridor even via the ?onboarding=EU deep
// link, so no user can reach the Monerium flow. When EU is re-enabled, restore the OAuth
// round-trip coverage this file carried before (git history: "Monerium EU OAuth returns
// securely and refreshes approval").

test("EU onboarding is disabled: card action and wizard deep link are both blocked", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  await seedSession(page);
  await page.goto("/overview");

  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Europe/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  await expect(page.getByRole("button", { name: "KYC is temporarily unavailable" })).toBeDisabled();

  await page.goto("/overview?onboarding=EU");
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("KYC is currently disabled in Europe.")).toBeVisible({ timeout: 20_000 });
  await wizard.getByRole("button", { exact: true, name: "Close" }).first().click();

  await expect(page).toHaveURL(/\/overview\?onboarding=EU$/, { timeout: 20_000 });
  await expect(page.getByRole("dialog").getByText("Verification in review")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue in background" })).toBeVisible();
  expect(backend.monerium.startRequests).toEqual([{ customerType: "individual" }]);

  await page.getByRole("button", { name: "Continue in background" }).click();
  await expect.poll(() => new URL(page.url()).search).toBe("");
  await expect(page.getByRole("button", { name: "Awaiting provider review" })).toBeVisible({ timeout: 20_000 });

  backend.monerium.approved = true;
  const euCard = page.getByTestId("corridor-card-EU");
  await expect(euCard.getByText("Approved", { exact: true })).toBeVisible({ timeout: 25_000 });
  await expect(page.getByRole("button", { name: "Awaiting provider review" })).toBeHidden();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Monerium callback refreshes an expired dashboard session, then lands on the disabled notice", async ({ page }) => {
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
  await expect(page.getByRole("dialog").getByText("KYC is currently disabled in Europe.")).toBeVisible();
  expect(backend.auth.refreshes).toBe(1);
});

test("in-review Monerium onboarding requiring reauthentication is disabled instead of actionable", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  backend.monerium.completed = true;
  await seedSession(page);
  await page.goto("/overview");

  const disabledButton = page.getByRole("button", { name: "KYC is temporarily unavailable" });
  await expect(disabledButton).toBeDisabled({ timeout: 20_000 });
  expect(backend.unmatchedRequests).toEqual([]);
});
