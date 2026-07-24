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

  const onboardingCta = page.getByRole("link", { name: "Get approved for Europe" });
  await expect(onboardingCta).toBeVisible({ timeout: 20_000 });
  await expect(onboardingCta).toHaveAttribute("href", "/overview?onboarding=EU");

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
