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

test("Quote errors during an active maintenance window say quotes are paused", async ({ page }) => {
  const backend = await mockBackend(page, { maintenanceActive: true });
  // The API's maintenance guard rejects quote creation for the whole window.
  await page.route("http://localhost:3000/v1/quotes", route =>
    route.fulfill({
      json: { message: "Vortex services are temporarily unavailable during scheduled maintenance", statusCode: 503 },
      status: 503
    })
  );
  await seedSession(page);
  const pausedMessage = page.getByText("Quotes are paused for scheduled maintenance. Try again once it ends.");

  await page.goto("/transfer?mode=onramp");
  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  await expect(pausedMessage).toBeVisible({ timeout: 20_000 });

  await page.goto("/transfer");
  await page.locator("#token-amount").fill("54.054054");
  await expect(pausedMessage).toBeVisible({ timeout: 20_000 });

  await page.goto("/quote");
  await page.getByLabel("You pay").fill("100");
  await expect(pausedMessage).toBeVisible({ timeout: 20_000 });

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
