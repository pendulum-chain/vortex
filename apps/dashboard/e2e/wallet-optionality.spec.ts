import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("existing-wallet users keep the external connect path when CDP flags are off", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);

  await page.goto("/overview");

  await expect(page.getByRole("button", { name: "Connect wallet" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Create an embedded wallet")).toHaveCount(0);
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
