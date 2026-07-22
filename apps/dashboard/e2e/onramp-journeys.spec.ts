import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { injectMockWallet, MOCK_WALLET_ADDRESS } from "./support/mockWallet";
import { seedSession } from "./support/session";

const DESTINATION = "0x1111111111111111111111111111111111111111";

const CASES = [
  { currency: "BRL", expected: "Copy PIX code" },
  { currency: "MXN", expected: "CLABE" },
  { currency: "USD", expected: "Routing number (ACH)" },
  { currency: "COP", expected: "Destination account" },
  { currency: "ARS", expected: "CVU" }
] as const;

test("transfer modes are route-backed and Cross-border is complete", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/transfer");

  await page.getByRole("tab", { name: "Cross-border" }).click();
  await expect(page).toHaveURL(/mode=cross-border/);
  await expect(page.getByText("Cross-border transfers are coming soon")).toBeVisible();

  await page.reload();
  await expect(page.getByRole("tab", { name: "Cross-border" })).toHaveAttribute("data-state", "active");
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Onramp prefills the connected wallet but keeps a manually edited destination", async ({ page }) => {
  const backend = await mockBackend(page);
  await injectMockWallet(page, { chainIdHex: "0x89" });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  const destination = page.getByLabel("Destination wallet address");
  await expect(destination).toHaveValue(MOCK_WALLET_ADDRESS, { timeout: 20_000 });
  await destination.fill(DESTINATION);
  await page.getByLabel("Network").click();
  await page.getByRole("option", { exact: true, name: "Polygon" }).click();
  await page.getByLabel("Token").click();
  await page.getByPlaceholder("Search token or network").fill("usdc");
  await page.getByRole("option", { exact: true, name: "USDC" }).click();
  await page.getByLabel("You pay (MXN)").fill("100");
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled({ timeout: 20_000 });
  await expect(destination).toHaveValue(DESTINATION);
  await expect(page.getByText("1 MXN = 0.2022 USDC", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Fee details" }).click();
  await expect(page.getByText("1 MXN = 0.1820 USDC", { exact: true })).toBeVisible();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Expired onramp payment instructions are hidden and can be replaced with a new quote", async ({ page }) => {
  const backend = await mockBackend(page, {
    fiatAccounts: [],
    onrampCurrency: "MXN",
    rampExpiresAt: new Date(Date.now() - 1000).toISOString()
  });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  const continueButton = page.getByRole("button", { name: "Continue to payment" });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();
  await expect(page.getByText("Payment instructions expired", { exact: true })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("CLABE", { exact: true })).toBeHidden();
  await expect(page.getByRole("button", { name: "I have made the payment" })).toBeHidden();

  const recoveryKeys = await page.evaluate(() => localStorage.getItem("vortex_dashboard_rampEphemerals"));
  expect(recoveryKeys).not.toBeNull();

  await page.getByRole("button", { name: "Get a new quote" }).click();

  await expect(page.getByLabel("Destination wallet address")).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("vortex-dashboard-transfer-state"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("vortex_dashboard_rampEphemerals"))).toBe(recoveryKeys);
  expect(backend.startRequests).toHaveLength(0);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("Onramp registration errors are shown on the form", async ({ page }) => {
  const backend = await mockBackend(page, {
    fiatAccounts: [],
    onrampCurrency: "MXN",
    rampRegisterError: "Could not prepare payment instructions"
  });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  const continueButton = page.getByRole("button", { name: "Continue to payment" });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();

  await expect(page.getByRole("alert")).toContainText("Could not prepare payment instructions");
  await expect(continueButton).toBeEnabled();
  expect(backend.registerRequests).toHaveLength(1);
  expect(backend.startRequests).toHaveLength(0);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("A failed onramp start keeps the payment instructions and retries the same ramp", async ({ page }) => {
  const backend = await mockBackend(page, { fiatAccounts: [], onrampCurrency: "MXN", rampStartFailures: 1 });
  await seedSession(page);
  await page.goto("/transfer?mode=onramp");

  await page.getByLabel("Destination wallet address").fill(DESTINATION);
  await page.getByLabel("You pay (MXN)").fill("100");
  const continueButton = page.getByRole("button", { name: "Continue to payment" });
  await expect(continueButton).toBeEnabled({ timeout: 20_000 });
  await continueButton.click();
  await expect(page.getByText("CLABE", { exact: true })).toBeVisible({ timeout: 20_000 });

  await page.getByRole("button", { name: "I have made the payment" }).click();
  await expect.poll(() => backend.startRequests.length).toBe(1);

  // The user may already have paid: the same ramp's instructions must survive the failure.
  await expect(page.getByText("CLABE", { exact: true })).toBeVisible();
  await expect(page.getByText(/you can safely try again/)).toBeVisible();

  await page.getByRole("button", { name: "Try again" }).click();
  await expect.poll(() => backend.startRequests.length).toBe(2);
  await expect(page).toHaveURL(/\/transactions/, { timeout: 20_000 });
  expect(backend.registerRequests).toHaveLength(1);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

for (const journey of CASES) {
  test(`BUY ${journey.currency}: quote, ephemeral registration, instructions, confirmation, start`, async ({ page }) => {
    const backend = await mockBackend(page, { fiatAccounts: [], onrampCurrency: journey.currency });
    await seedSession(page);
    await page.goto("/transfer?mode=onramp");

    const destination = page.getByLabel("Destination wallet address");
    await expect(destination).toBeVisible({ timeout: 20_000 });
    await destination.fill(DESTINATION);
    await page.getByLabel(`You pay (${journey.currency})`).fill("100");

    await page.getByLabel("Network").click();
    await page.getByRole("option", { exact: true, name: "Polygon" }).click();
    await page.getByLabel("Token").click();
    await page.getByPlaceholder("Search token or network").fill("usdc");
    await page.getByRole("option", { exact: true, name: "USDC" }).click();

    const continueButton = page.getByRole("button", { name: "Continue to payment" });
    await expect(continueButton).toBeEnabled({ timeout: 20_000 });
    await continueButton.click();

    await expect(page.getByText(journey.expected, { exact: true })).toBeVisible({ timeout: 20_000 });
    if (journey.currency === "MXN") {
      await page.reload();
      await expect(page.getByText("CLABE", { exact: true })).toBeVisible({ timeout: 20_000 });
    }
    expect(backend.startRequests).toHaveLength(0);
    expect(backend.quoteRequests.at(-1)).toMatchObject({
      inputAmount: "100",
      inputCurrency: journey.currency,
      network: "polygon",
      outputCurrency: "USDC",
      rampType: "BUY",
      to: "polygon"
    });
    expect(backend.registerRequests).toHaveLength(1);
    expect(backend.registerRequests[0]).toMatchObject({ additionalData: { destinationAddress: DESTINATION } });
    expect((backend.registerRequests[0].additionalData as Record<string, unknown>).walletAddress).toBeUndefined();
    expect(backend.updateRequests).toHaveLength(1);

    await page.getByRole("button", { name: "I have made the payment" }).click();
    await expect.poll(() => backend.startRequests.length).toBe(1);
    await expect(page).toHaveURL(/\/transactions/);
    await expect(page.getByText("Onramp", { exact: true })).toBeVisible();
    expect(backend.unmatchedRequests).toEqual([]);
    expect(backend.unexpectedExternalRequests).toEqual([]);
  });
}
