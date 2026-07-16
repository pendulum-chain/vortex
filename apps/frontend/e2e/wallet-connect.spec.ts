import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { injectMockWallet } from "./support/mockWallet";

// Critical journey 3: an offramp requires a connected wallet.
// Without one, the submit slot asks to connect; with the injected mock wallet
// (announced via EIP-6963, auto-connected by wagmi), the app shows the account
// and the Sell action instead.

test("offramp without a wallet asks to connect instead of offering Sell", async ({ page }) => {
  await mockBackend(page);

  await page.goto("/widget?rampType=SELL&fiat=BRL&inputAmount=100");

  await expect(page.getByRole("button", { name: /Connect/ }).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("form").getByRole("button", { name: "Sell" })).toHaveCount(0);
});

test("offramp with the injected mock wallet connects and shows the Sell action", async ({ page }) => {
  await mockBackend(page);
  await injectMockWallet(page);

  await page.goto("/widget?rampType=SELL&fiat=BRL&inputAmount=100");

  // The connected account (0xf39F...b92266) appears in the navbar.
  await expect(page.getByRole("button", { name: /0xf39F/ })).toBeVisible({ timeout: 20_000 });

  // The submit slot offers Sell instead of the connect prompt. (It may still be
  // disabled — the mock wallet holds no USDC — but the wallet gate is passed.)
  await expect(page.locator("form").getByRole("button", { name: "Sell" })).toBeVisible();
  await expect(page.getByRole("button", { name: /Connect/ })).toHaveCount(0);
});
