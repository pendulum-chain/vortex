import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { injectMockWallet } from "./support/mockWallet";
import { seedSession } from "./support/session";

const POLYGON_USDC = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359";
const POLYGON_USDT = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f";
const NATIVE_TOKEN = "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee";

// Self-custodial crypto deposits are not supported, so the connected wallet is the only funding path.
test("funding panel offers connected-wallet submission only", async ({ page }) => {
  const backend = await mockBackend(page);
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);

  await page.goto("/transfer");

  const amountInput = page.locator("#token-amount");
  await expect(amountInput).toBeVisible({ timeout: 20_000 });
  await amountInput.fill("54.054054");

  // The quote lands and the funding panel renders the connected wallet.
  await expect(page.getByText("Connected")).toBeVisible({ timeout: 20_000 });

  await expect(page.getByText("Send crypto")).toHaveCount(0);
  await expect(page.getByText("Available: 1,000 USDC on Polygon", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send/ })).toBeEnabled();
  await expect(page.getByText(/reach out to/)).toHaveCount(0);
  expect(backend.balanceRequests.at(-1)).toMatchObject({ network: "polygon-mainnet" });

  await page.getByRole("button", { name: /0xf39F/ }).click();
  await expect(page.getByRole("alertdialog").getByRole("button", { name: "Disconnect" })).toBeVisible();
});

test("insufficient selected-network USDC balance blocks an offramp", async ({ page }) => {
  const backend = await mockBackend(page, { tokenBalances: { [POLYGON_USDC]: 50_000_000n } });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.locator("#token-amount").fill("54.054054");

  await expect(page.getByText("Available: 50 USDC on Polygon", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Insufficient USDC balance.*54\.054 USDC on Polygon/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();
  expect(backend.registerRequests).toHaveLength(0);
});

test("balance check follows the selected payin network, not the wallet chain", async ({ page }) => {
  const backend = await mockBackend(page, {
    tokenBalances: (_requestIndex, network) =>
      network === "polygon-mainnet"
        ? { [POLYGON_USDC]: 1_000_000_000n }
        : { "0xaf88d065e77c8cc2239327c5edb3a432268e5831": 1_000_000n }
  });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.locator("#token-amount").fill("54.054054");
  const sendButton = page.getByRole("button", { name: /^Send/ });
  await expect(sendButton).toBeEnabled({ timeout: 20_000 });

  await page.getByRole("combobox").filter({ hasText: "Polygon" }).click();
  await page.getByRole("option", { exact: true, name: "Arbitrum One" }).click();

  await expect(page.getByText("Available: 1 USDC on Arbitrum One", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(sendButton).toBeDisabled();
  expect(backend.balanceRequests.map(request => request.network)).toEqual(
    expect.arrayContaining(["polygon-mainnet", "arb-mainnet"])
  );
});

test("registration rechecks balance after quote refresh", async ({ page }) => {
  const backend = await mockBackend(page, {
    tokenBalances: requestIndex => ({ [POLYGON_USDC]: requestIndex === 0 ? 1_000_000_000n : 1_000_000n })
  });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.locator("#token-amount").fill("54.054054");
  const sendButton = page.getByRole("button", { name: /^Send/ });
  await expect(sendButton).toBeEnabled({ timeout: 20_000 });
  await sendButton.click();

  await expect(page.getByText("Could not start transfer", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Insufficient USDC balance on Polygon/)).toBeVisible();
  expect(backend.balanceRequests).toHaveLength(2);
  expect(backend.registerRequests).toHaveLength(0);
});

test("balance lookup failure blocks an offramp", async ({ page }) => {
  const backend = await mockBackend(page, { tokenBalances: null });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.locator("#token-amount").fill("54.054054");

  await expect(page.getByRole("alert")).toContainText("Could not verify your USDC balance on Polygon", {
    timeout: 20_000
  });
  await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Retry balance check" })).toBeVisible();
  expect(backend.registerRequests).toHaveLength(0);
});

test("balance gate checks the selected ERC-20 rather than another held token", async ({ page }) => {
  const backend = await mockBackend(page, {
    tokenBalances: { [POLYGON_USDC]: 1_000_000_000n, [POLYGON_USDT]: 50_000_000n }
  });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.getByRole("combobox").filter({ hasText: "USDC" }).click();
  await page.getByRole("option", { exact: true, name: "USDT" }).click();
  await page.locator("#token-amount").fill("100");

  await expect(page.getByText("Available: 50 USDT on Polygon", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(/Insufficient USDT balance/)).toBeVisible();
  await expect(page.getByRole("button", { name: /^Send/ })).toBeDisabled();
  expect(backend.registerRequests).toHaveLength(0);
});

test("native POL uses the portfolio native balance", async ({ page }) => {
  await mockBackend(page, { tokenBalances: { [NATIVE_TOKEN]: 2n * 10n ** 18n } });
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer");

  await page.getByRole("combobox").filter({ hasText: "USDC" }).click();
  await page.getByRole("option", { exact: true, name: "POL" }).click();
  await page.locator("#token-amount").fill("1");

  await expect(page.getByText("Available: 2 POL on Polygon", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: /Send ≈ 1 POL/ })).toBeEnabled();
});

test("connect wallet opens the AppKit connect view", async ({ page }) => {
  await mockBackend(page);
  await seedSession(page);

  await page.goto("/transfer");
  await page.getByRole("button", { name: "Connect wallet" }).first().click();

  await expect(page.getByText("Connect Wallet", { exact: true })).toBeVisible();
});
