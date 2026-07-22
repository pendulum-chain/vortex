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
        fromAmount: "100.00",
        fromCurrency: "MXN",
        id: "failed-buy",
        status: "FAILED",
        to: "polygon",
        toAmount: "18.20",
        toCurrency: "USDC",
        type: "BUY",
        walletAddress: "0x1111111111111111111111111111111111111111"
      },
      {
        currentPhase: "failed",
        date: "2026-07-21T00:00:00.000Z",
        from: "polygon",
        fromAmount: "54.054054",
        fromCurrency: "USDC",
        id: "failed-sell",
        status: "FAILED",
        to: "spei",
        toAmount: "1000.00",
        toCurrency: "MXN",
        type: "SELL",
        walletAddress: "0x2222222222222222222222222222222222222222"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/transactions");

  const onrampRow = page.getByRole("row").filter({ hasText: "Onramp" });
  await expect(onrampRow).toContainText("0x1111…1111");
  await onrampRow.getByRole("button", { name: "Get help" }).click();
  await expect(page.getByText("We'll email you about this failed onramp.", { exact: true })).toBeVisible();

  const offrampRow = page.getByRole("row").filter({ hasText: "Offramp" });
  await expect(offrampRow).toContainText("Payout account");
  await expect(offrampRow).not.toContainText("0x2222…2222");
  await offrampRow.getByRole("button", { name: "Get help" }).click();
  await expect(page.getByText("We'll email you about this failed payout.", { exact: true })).toBeVisible();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
