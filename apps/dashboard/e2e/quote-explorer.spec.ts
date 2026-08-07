import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("EUR is quotable on BUY and an unapproved corridor routes to onboarding", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/quote");

  await page.getByLabel("Fiat currency").click();
  await page.getByRole("option", { name: /EURC/ }).click();
  await page.getByLabel("You pay").fill("100");

  await expect.poll(() => backend.quoteRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(backend.quoteRequests.at(-1)).toMatchObject({ inputCurrency: "EUR", paymentMethod: "sepa", rampType: "BUY" });

  const onboardingCta = page.getByRole("link", { name: "Start onboarding for Europe" });
  await expect(onboardingCta).toBeVisible({ timeout: 20_000 });
  await expect(onboardingCta).toHaveAttribute("href", "/overview?onboarding=EU");
  await onboardingCta.click();

  await expect(page).toHaveURL(/\/overview\?onboarding=EU$/);
  await expect(page.getByRole("dialog").getByText("KYC is currently disabled in Europe.")).toBeVisible();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("An approved EUR BUY explains the missing transfer flow instead of linking the form", async ({ page }) => {
  const backend = await mockBackend(page, { moneriumKyc: true });
  // Onboarding status reports an approved Monerium (EU) account from the first poll.
  backend.monerium.completed = true;
  backend.monerium.approved = true;
  backend.monerium.authorized = true;
  await seedSession(page);
  await page.goto("/quote");

  await page.getByLabel("Fiat currency").click();
  await page.getByRole("option", { name: /EURC/ }).click();
  await page.getByLabel("You pay").fill("100");

  await expect(page.getByText("Buying crypto with EURC isn’t available in transfers yet.")).toBeVisible({
    timeout: 20_000
  });
  await expect(page.getByRole("link", { name: "Continue to transfer" })).toBeHidden();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("SELL carries the token input, network, and corridor into the offramp", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/quote");

  await page.getByRole("tab", { name: "Sell crypto" }).click();
  await page.getByLabel("Fiat currency").click();
  await page.getByRole("option", { name: /MXN/ }).click();
  await page.getByRole("combobox").filter({ hasText: /^POL$/ }).click();
  await page.getByRole("option", { exact: true, name: "USDC" }).click();
  await page.getByLabel("You pay").fill("54.054567");

  const continueLink = page.getByRole("link", { name: "Continue to transfer" });
  await expect(continueLink).toBeVisible({ timeout: 20_000 });
  await continueLink.click();

  await expect(page).toHaveURL(/\/transfer/);
  const search = new URL(page.url()).searchParams;
  const decoded = (key: string) => {
    const value = search.get(key);
    return value?.startsWith('"') ? JSON.parse(value) : value;
  };
  expect(decoded("amount")).toBe("54.054567");
  expect(decoded("corridorId")).toBe("MX");
  expect(decoded("mode")).toBe("offramp");
  expect(decoded("network")).toBe("polygon");
  expect(decoded("token")).toBe("USDC");
  await expect(page.locator("#token-amount")).toHaveValue("54.054567");
  await expect(page.getByRole("combobox").filter({ hasText: "Polygon" })).toBeVisible();
  await expect(page.getByRole("combobox").filter({ hasText: "USDC" })).toBeVisible();
  expect(backend.quoteRequests.at(-1)).toMatchObject({
    inputAmount: "54.054567",
    inputCurrency: "USDC",
    network: "polygon",
    outputCurrency: "MXN",
    rampType: "SELL"
  });
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
