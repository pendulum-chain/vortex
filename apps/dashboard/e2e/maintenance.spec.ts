import { expect, test } from "@playwright/test";
import { MAINTENANCE_DETAILS, mockBackend } from "./support/mockBackend";
import { injectMockWallet } from "./support/mockWallet";
import { seedSession } from "./support/session";

const DESTINATION = "0x1111111111111111111111111111111111111111";

test("An active maintenance window shows the banner and blocks starting an onramp", async ({ page }) => {
  const backend = await mockBackend(page, { fiatAccounts: [], maintenanceActive: true, onrampCurrency: "MXN" });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  await expect(page.getByText(MAINTENANCE_DETAILS.title)).toBeVisible({ timeout: 20_000 });
  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  await expect(page.getByText("You receive", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeDisabled();

  expect(backend.registerRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("A maintenance window that starts during payment setup blocks the payment confirmation", async ({ page }) => {
  const backend = await mockBackend(page, { fiatAccounts: [], onrampCurrency: "MXN" });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  const continueButton = page.getByRole("button", { name: "Continue to payment" });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();
  const confirmButton = page.getByRole("button", { name: "I have made the payment" });
  await expect(confirmButton).toBeEnabled({ timeout: 20_000 });

  backend.maintenance.active = true;
  // React Query refetches on visibilitychange, as when the sender returns to the tab. Repeat it: the
  // status request fired when the instructions mounted may still be in flight with the old answer.
  await expect(async () => {
    await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange", { bubbles: true })));
    await expect(page.getByText(MAINTENANCE_DETAILS.title)).toBeVisible({ timeout: 1_000 });
  }).toPass({ timeout: 15_000 });
  await expect(confirmButton).toBeDisabled();
  expect(backend.startRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("An active maintenance window blocks sending an offramp", async ({ page }) => {
  const backend = await mockBackend(page, { maintenanceActive: true });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer?network=polygon");

  const amountInput = page.locator("#token-amount");
  await expect(amountInput).toBeVisible({ timeout: 20_000 });
  await amountInput.fill("54.054054");
  await expect(page.getByText("Available: 1,000 USDC on Polygon", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(MAINTENANCE_DETAILS.title)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();

  expect(backend.registerRequests).toEqual([]);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
