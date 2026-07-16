import { expect, type Locator, type Page, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

// A document file — the drop zone only checks mimeType and size, not the bytes.
const idDocument = { buffer: Buffer.from("e2e-id-document"), mimeType: "image/png", name: "id.png" };

/**
 * Real Alfredpay MX individual KYC, driven end to end: add the corridor, create the customer,
 * fill the form, upload the ID documents, and land on the "In review" screen where the machine
 * is polling for the outcome. Returns the open wizard dialog. Login is seeded (the OTP flow is
 * covered by login.spec.ts); the KYC machine's own logic is unit-tested in packages/kyc, so this
 * exercises the dashboard's wiring around it.
 */
async function driveToInReview(page: Page): Promise<Locator> {
  await seedSession(page);
  await page.goto("/overview");

  // Add the Mexico corridor (onboarding status starts empty, so nothing is pre-added).
  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Mexico/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  // Start KYC → the machine checks status (404, no customer) → customer-definition screen.
  await page.getByRole("button", { name: "Start KYC" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("We'll create your Mexico individual verification profile")).toBeVisible({ timeout: 20_000 });
  await wizard.getByRole("button", { name: "Continue" }).click();

  // Customer created → the MX KYC form.
  await expect(page.locator('input[name="firstName"]')).toBeVisible({ timeout: 20_000 });
  await page.locator('input[name="firstName"]').fill("Maria");
  await page.locator('input[name="lastName"]').fill("Gomez");
  await page.locator('input[name="dateOfBirth"]').fill("1990-05-20");
  await page.locator('input[name="dni"]').fill("GOMM900520MDFXYZ01");
  await page.locator('input[name="address"]').fill("Av Reforma 100");
  await page.locator('input[name="city"]').fill("Ciudad de Mexico");
  await page.locator('input[name="state"]').fill("CDMX");
  await page.locator('input[name="zipCode"]').fill("06600");
  await wizard.getByRole("button", { name: "Continue" }).click();

  // Information submitted → the document upload screen (MX needs front + back, no selfie).
  await expect(wizard.getByText("Identity document")).toBeVisible({ timeout: 20_000 });
  const fileInputs = page.locator('input[type="file"]');
  await fileInputs.nth(0).setInputFiles({ ...idDocument, name: "front.png" });
  await fileInputs.nth(1).setInputFiles({ ...idDocument, name: "back.png" });
  const submit = wizard.getByRole("button", { name: "Submit documents" });
  await expect(submit).toBeEnabled();
  await submit.click();

  // Files uploaded + submission sent → the machine is polling for the review outcome.
  await expect(wizard.getByText("Alfredpay is reviewing your submission")).toBeVisible({ timeout: 20_000 });
  return wizard;
}

test("Alfredpay MX KYC: approval arrives while the wizard stays open", async ({ page }) => {
  const backend = await mockBackend(page, { alfredpayKyc: {} });
  const wizard = await driveToInReview(page);

  await expect(wizard.getByRole("button", { name: "Continue in background" })).toBeVisible();
  expect(backend.kycFormSubmissions).toHaveLength(1);
  expect(backend.kycFormSubmissions[0]).toMatchObject({ country: "MX", firstName: "Maria", lastName: "Gomez" });

  // The provider approves — the machine's next poll picks it up and the wizard advances itself.
  backend.kyc.approved = true;
  await expect(wizard.getByText("You can now register recipients")).toBeVisible({ timeout: 15_000 });
  await expect(wizard.getByRole("button", { name: "Done" })).toBeVisible();
  // The real flow fires the completion notification (the mocked flows don't reach it).
  await expect(page.getByText("Mexico KYC approved")).toBeVisible();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Alfredpay MX KYC: continuing in the background, the card reacts to approval without a reload", async ({ page }) => {
  const backend = await mockBackend(page, { alfredpayKyc: {} });
  const wizard = await driveToInReview(page);

  // Leave the wizard; the machine is torn down, so only the card's onboarding-status polling
  // can surface the outcome now.
  await wizard.getByRole("button", { name: "Continue in background" }).click();
  await expect(page.getByRole("button", { name: "Awaiting provider review" })).toBeVisible({ timeout: 20_000 });

  backend.kyc.approved = true;
  // No interaction, no reload — the 15s onboarding-status refetch flips the card to approved.
  await expect(page.getByRole("button", { name: "Verification complete" })).toBeVisible({ timeout: 25_000 });
});

test("Alfredpay MX KYC: closing on the details form and reloading keeps the card resumable", async ({ page }) => {
  // Regression: creating the customer moves the backend to `started`; the card used to render a
  // disabled "Verification started", locking the user out of a KYC they hadn't finished. It must
  // stay resumable across a modal close + full reload.
  await mockBackend(page, { alfredpayKyc: {} });
  await seedSession(page);
  await page.goto("/overview");

  // Add Mexico and start KYC through customer creation, landing on the details form.
  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Mexico/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  await page.getByRole("button", { name: "Start KYC" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("We'll create your Mexico individual verification profile")).toBeVisible({ timeout: 20_000 });
  await wizard.getByRole("button", { name: "Continue" }).click();
  await expect(page.locator('input[name="firstName"]')).toBeVisible({ timeout: 20_000 });

  // Abandon the form and reload — the backend still holds the half-finished `started` account.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();
  await page.reload();

  // The card offers a resumable action instead of a dead disabled button.
  const resume = page.getByRole("button", { name: "Continue KYC" });
  await expect(resume).toBeEnabled({ timeout: 20_000 });

  // Reopening re-checks canonical status (CONSULTED) and returns straight to the details form.
  await resume.click();
  await expect(page.locator('input[name="firstName"]')).toBeVisible({ timeout: 20_000 });
});

test("Alfredpay MX KYC: closing while pending and reopening shows the approval in the wizard", async ({ page }) => {
  // reflectOnboarding:false keeps the onboarding aggregator behind the provider, so the card
  // action stays enabled and the wizard can be reopened while the provider is still reviewing.
  const backend = await mockBackend(page, { alfredpayKyc: { reflectOnboarding: false } });
  const wizard = await driveToInReview(page);
  await expect(wizard.getByRole("button", { name: "Continue in background" })).toBeVisible();

  // Dismiss the wizard while the review is still pending.
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  // Reopen it — the machine re-checks status (VERIFYING) and returns straight to "In review".
  await page.getByRole("button", { name: "Start KYC" }).click();
  const reopened = page.getByRole("dialog");
  await expect(reopened.getByText("Alfredpay is reviewing your submission")).toBeVisible({ timeout: 20_000 });

  // Approval now arrives — the reopened wizard advances to the approved screen.
  backend.kyc.approved = true;
  await expect(reopened.getByText("You can now register recipients")).toBeVisible({ timeout: 15_000 });
});
