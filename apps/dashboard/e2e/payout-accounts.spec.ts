import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("an approved AlfredPay corridor adds a self payout account", async ({ page }) => {
  const backend = await mockBackend(page, { fiatAccounts: [] });
  await seedSession(page);
  await page.goto("/overview");

  const card = page.getByTestId("corridor-card-MX");
  await expect(card.getByRole("button", { name: "Add payout account" })).toBeVisible({ timeout: 20_000 });
  await expect(card.getByText(/to enable reception of money through offramps/)).toBeVisible();

  const progress = card.getByRole("progressbar", { name: "Mexico onboarding progress" });
  await expect(progress).toHaveAttribute("aria-valuenow", "90");
  await expect(progress.locator('[data-slot="progress-indicator"]')).toHaveClass(/bg-primary/);

  await card.getByRole("button", { name: "Add payout account" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByText(/enables reception of money through offramps/)).toBeVisible();
  await dialog.getByLabel("CLABE").fill("646180157000000004");
  await dialog.getByLabel("Account holder name").fill("Vortex E2E CLABE");
  await dialog.getByRole("button", { name: "Save payout account" }).click();

  await expect(card.getByText("Verification complete · 1 payout account")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(progress).toHaveAttribute("aria-valuenow", "100");
  await expect(progress.locator('[data-slot="progress-indicator"]')).toHaveClass(/bg-success/);
  expect(backend.fiatAccountRequests).toEqual([
    {
      accountName: "Vortex E2E CLABE",
      accountNumber: "646180157000000004",
      country: "MX",
      isExternal: false,
      type: "SPEI"
    }
  ]);

  await page.goto("/recipients");
  await expect(page.getByText("SPEI · Vortex E2E CLABE · ••••0004", { exact: true })).toBeVisible({ timeout: 20_000 });
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("an approved AlfredPay corridor removes a payout account after confirmation", async ({ page }) => {
  const backend = await mockBackend(page, {
    fiatAccounts: [
      {
        accountName: "Vortex E2E CLABE",
        accountNumber: "646180157000000004",
        country: "MX",
        fiatAccountId: "fiat-account-to-delete",
        type: "SPEI"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/overview");

  const card = page.getByTestId("corridor-card-MX");
  await card.getByRole("button", { name: "View payout accounts" }).click();
  const dialog = page.getByRole("dialog");
  const remove = dialog.getByRole("button", { name: "Remove account ending in 0004" });
  await remove.click();

  const confirm = dialog.getByRole("button", { name: "Confirm removal of account ending in 0004" });
  await expect(confirm).toBeVisible();
  expect(backend.fiatAccountDeleteRequests).toEqual([]);
  await confirm.click();

  await expect(dialog.getByText("Vortex E2E CLABE", { exact: false })).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: "Add payout account" })).toBeVisible();
  expect(backend.fiatAccountDeleteRequests).toEqual([{ country: "MX", fiatAccountId: "fiat-account-to-delete" }]);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
