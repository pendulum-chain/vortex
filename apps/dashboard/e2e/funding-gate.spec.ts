import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { injectMockWallet } from "./support/mockWallet";
import { seedSession } from "./support/session";

// Self-custodial crypto deposits are not supported, so the connected wallet is the only funding path.
test("funding panel offers connected-wallet submission only", async ({ page }) => {
  await mockBackend(page);
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);

  await page.goto("/transfer");

  const amountInput = page.locator("#payout-amount");
  await expect(amountInput).toBeVisible({ timeout: 20_000 });
  await amountInput.fill("1000");

  // The quote lands and the funding panel renders the connected wallet.
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText("Send crypto")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Send/ })).toBeEnabled();
  await expect(page.getByText(/reach out to/)).toHaveCount(0);
});
