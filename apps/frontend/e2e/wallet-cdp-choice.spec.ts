import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";

test("the widget offers both external and Vortex wallets when provisioning is enabled", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "cdp-choice", "Runs with the opt-in CDP Playwright configuration");

  await mockBackend(page);
  await page.goto("/widget?rampType=SELL&fiat=BRL&inputAmount=100");

  await expect(page.getByRole("button", { name: /Connect Wallet/ }).first()).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("button", { name: "Use a Vortex wallet" }).first()).toBeVisible();
});
