import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("transaction destinations and failure help are direction-aware", async ({ page }) => {
  const backend = await mockBackend(page, {
    rampHistory: [
      {
        currentPhase: "failed",
        date: "2026-07-21T00:00:00.000Z",
        from: "spei",
        fromAmount: "100.000000000000000000",
        fromCurrency: "MXN",
        id: "failed-buy",
        status: "FAILED",
        to: "polygon",
        toAmount: "18.234567000000000000",
        toCurrency: "USDC",
        type: "BUY",
        walletAddress: "0x1111111111111111111111111111111111111111"
      },
      {
        currentPhase: "failed",
        date: "2026-07-21T00:00:00.000Z",
        from: "polygon",
        fromAmount: "54.054567000000000000",
        fromCurrency: "USDC",
        id: "failed-sell",
        status: "FAILED",
        to: "spei",
        toAmount: "1000.000000000000000000",
        toCurrency: "MXN",
        type: "SELL",
        walletAddress: "0x2222222222222222222222222222222222222222"
      },
      {
        currentPhase: "initial",
        date: "2026-07-21T00:00:00.000Z",
        from: "polygon",
        fromAmount: "1.000000000000000000",
        fromCurrency: "USDC",
        id: "initial-sell",
        status: "PENDING",
        to: "cbu",
        toAmount: "1503.430000000000000000",
        toCurrency: "ARS",
        type: "SELL",
        walletAddress: "0x3333333333333333333333333333333333333333"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/transactions");

  const onrampRow = page.getByRole("row").filter({ hasText: "Pay-in" });
  await expect(onrampRow).toContainText("0x1111…1111");
  await expect(onrampRow).toContainText("100 MXN");
  await expect(onrampRow).toContainText("18.2345 USDC");
  await onrampRow.getByRole("button", { name: "Get help" }).click();
  await expect(page.getByText("We'll email you about this failed pay-in.", { exact: true })).toBeVisible();

  const offrampRow = page.getByRole("row").filter({ hasText: "Pay-out" });
  await expect(offrampRow).toContainText("Pay-out account");
  await expect(offrampRow).toContainText("54.0545 USDC");
  await expect(offrampRow).toContainText("1,000 MXN");
  await expect(offrampRow).not.toContainText("0x2222…2222");
  await offrampRow.getByRole("button", { name: "Get help" }).click();
  await expect(page.getByText("We'll email you about this failed pay-out.", { exact: true })).toBeVisible();
  await expect(page.getByRole("row").filter({ hasText: "1,503.43 ARS" })).toHaveCount(0);

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
