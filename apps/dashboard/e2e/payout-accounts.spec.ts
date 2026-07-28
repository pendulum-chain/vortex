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

  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: "View payout accounts" })).toBeVisible();
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

test("a provider-rejected payout account surfaces field and form errors instead of a generic failure", async ({ page }) => {
  const backend = await mockBackend(page, {
    fiatAccountAddError: {
      error: "The payout provider rejected this account number. Double-check it and try again.",
      fields: [{ field: "accountNumber", message: "This account number was rejected by the payout provider." }]
    },
    fiatAccounts: []
  });
  await seedSession(page);
  await page.goto("/overview");

  const card = page.getByTestId("corridor-card-MX");
  await card.getByRole("button", { name: "Add payout account" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("CLABE").fill("646180157000000004");
  await dialog.getByLabel("Account holder name").fill("Vortex E2E CLABE");
  await dialog.getByRole("button", { name: "Save payout account" }).click();

  await expect(dialog.getByText("This account number was rejected by the payout provider.")).toBeVisible();
  await expect(
    dialog.getByText("The payout provider rejected this account number. Double-check it and try again.")
  ).toBeVisible();
  // The form stays open for correction and nothing was added.
  await expect(dialog.getByRole("button", { name: "Save payout account" })).toBeEnabled();
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(card.getByRole("button", { name: "Add payout account" })).toBeVisible();
  expect(backend.fiatAccountRequests).toHaveLength(1);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("an approved AlfredPay corridor removes a payout account after confirmation", async ({ page }) => {
  const backend = await mockBackend(page, {
    fiatAccounts: [
      {
        accountNumber: "646180157000000004",
        country: "MX",
        fiatAccountId: "fiat-account-to-delete",
        metadata: { accountHolderName: "Vortex E2E CLABE" },
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
