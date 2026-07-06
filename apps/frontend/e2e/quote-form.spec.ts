import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";

// Critical journey 1: the quote form requests a quote from the API and displays it.
test("onramp quote form fetches and displays a quote", async ({ page }) => {
  const { quoteRequests } = await mockBackend(page);

  await page.goto("/widget?rampType=BUY&fiat=BRL&inputAmount=100");

  await expect(page.getByText("You pay")).toBeVisible();
  await expect(page.getByText("You receive")).toBeVisible();

  // The app requests a BUY quote for the amount from the URL...
  await expect.poll(() => quoteRequests.length, { timeout: 20_000 }).toBeGreaterThan(0);
  expect(quoteRequests[0]).toMatchObject({
    inputAmount: "100",
    inputCurrency: "BRL",
    rampType: "BUY"
  });

  // ...and displays the quoted output amount in the read-only receive field.
  await expect(page.locator('input[name="outputAmount"]')).toHaveValue(/25\.5/, { timeout: 20_000 });

  // A fresh quote enables the submit button (the toggle also says "Buy", so scope to the form).
  await expect(page.locator("form").getByRole("button", { name: "Buy" })).toBeEnabled();
});

// Critical journey 2: a quote rejection from the API surfaces as a readable error.
test("quote errors from the API are shown to the user", async ({ page }) => {
  await mockBackend(page, {
    quotes: () => ({ body: { error: "Input amount too low to cover fees" }, status: 400 })
  });

  await page.goto("/widget?rampType=BUY&fiat=BRL&inputAmount=1");

  await expect(page.getByText("Input amount too low. Please try a larger amount.")).toBeVisible({ timeout: 20_000 });
  await expect(page.locator("form").getByRole("button", { name: "Buy" })).toBeDisabled();
});
