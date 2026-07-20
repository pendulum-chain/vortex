import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("a new dashboard user selects and persists a company sender entity", async ({ page }) => {
  await mockBackend(page, { selectionRequired: true });
  await seedSession(page);
  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "How will you use Vortex?" })).toBeVisible();
  await page.getByRole("button", { name: "Continue as company" }).click();
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByText("No corridors added yet")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "How will you use Vortex?" })).toBeHidden();
});
