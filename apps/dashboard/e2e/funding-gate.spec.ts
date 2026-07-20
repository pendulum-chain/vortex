import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { injectMockWallet } from "./support/mockWallet";
import { seedSession } from "./support/session";

// Self-custodial crypto deposits are not supported, and self-serve transfers are enabled per
// account on request — so the funding panel offers the connected wallet only, with its submit
// button commented out. This pins that gate; the money-path journeys in transfer-mxn-journey.spec.ts
// are skipped until the button returns.
test("funding panel is gated: no crypto tab, no submit button, support note shown", async ({ page }) => {
  await mockBackend(page);
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);

  await page.goto("/transfer");

  const amountInput = page.locator("#payout-amount");
  await expect(amountInput).toBeVisible({ timeout: 20_000 });
  await amountInput.fill("1000");

  // The quote lands and the funding panel renders the connected wallet.
  await expect(page.getByText("How you'll fund this")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText("Send crypto")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Send/ })).toHaveCount(0);
  await expect(page.getByText(/reach out to/)).toBeVisible();
  await expect(page.getByRole("link", { name: "support@vortexfinance.co" })).toBeVisible();
});
