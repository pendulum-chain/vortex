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
  await page.getByLabel("You pay (MXN)").fill("100");
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled({ timeout: 20_000 });
  await expect(destination).toHaveValue(DESTINATION);

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
