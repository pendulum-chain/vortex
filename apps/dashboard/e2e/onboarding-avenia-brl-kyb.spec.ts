import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("Avenia BR business KYB completes company and representative hosted steps before approval", async ({ page }) => {
  await page.addInitScript(() => {
    const browserWindow = window as Window & { __e2eOpenedUrls?: string[] };
    browserWindow.__e2eOpenedUrls = [];
    window.open = ((url?: string | URL) => {
      browserWindow.__e2eOpenedUrls?.push(String(url));
      return null;
    }) as typeof window.open;
  });
  const backend = await mockBackend(page, { aveniaKyb: true, companyMode: true });
  await seedSession(page);
  await page.goto("/overview");

  await expect(page.getByText("No corridors added yet")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Add corridor" }).click();
  const addDialog = page.getByRole("dialog");
  await addDialog.getByRole("combobox").click();
  await page.getByRole("option", { name: /Brazil/ }).click();
  await addDialog.getByRole("button", { name: "Add card" }).click();

  await page.getByRole("button", { name: "Start KYB" }).click();
  const wizard = page.getByRole("dialog");
  await expect(wizard.getByText("Company information")).toBeVisible();
  await page.locator('input[name="fullName"]').fill("Vortex Brasil Ltda");
  await page.locator('input[name="taxId"]').fill("12.345.678/0001-95");
  await wizard.getByRole("button", { exact: true, name: "Continue" }).click();

  await expect(wizard.getByText("Verify your company")).toBeVisible({ timeout: 20_000 });
  await wizard.getByRole("button", { name: "Continue to Avenia" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls))
    .toEqual(["https://hosted.avenia.example/company"]);
  await wizard.getByRole("button", { name: "I completed this step" }).click();

  await expect(wizard.getByText("Verify the company representative")).toBeVisible();
  await wizard.getByRole("button", { name: "Continue to Avenia" }).click();
  await expect
    .poll(() => page.evaluate(() => (window as Window & { __e2eOpenedUrls?: string[] }).__e2eOpenedUrls))
    .toEqual(["https://hosted.avenia.example/company", "https://hosted.avenia.example/representative"]);
  await wizard.getByRole("button", { name: "I completed this step" }).click();

  await expect(wizard.getByText("Avenia is reviewing the company and representative information")).toBeVisible();
  expect(backend.brlaCreateSubaccountRequests).toEqual([
    { accountType: "COMPANY", name: "Vortex Brasil Ltda", taxId: "12.345.678/0001-95" }
  ]);
  await expect.poll(() => backend.avenia.statusPolls).toBeGreaterThan(0);

  backend.avenia.approved = true;
  await expect(wizard.getByText("Your Brazil KYB is complete")).toBeVisible({ timeout: 10_000 });
  await expect(wizard.getByRole("button", { name: "Done" })).toBeVisible();
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
