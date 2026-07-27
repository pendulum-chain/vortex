import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("Privy enablement adds an optional choice without removing external wallets", async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== "privy-choice", "Runs with the opt-in Privy Playwright configuration");

  const backend = await mockBackend(page, { appOrigin: "http://127.0.0.1:5175" });
  await seedSession(page);

  await page.goto("/overview");
  await page.getByRole("button", { name: "Choose wallet" }).click();

  await expect(page.getByRole("heading", { name: "Choose how to use a wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Connect an existing wallet" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Create an embedded wallet" })).toBeVisible();
  await expect(page.getByText("Embedded wallets are optional.")).toBeVisible();

  await page.getByRole("button", { name: "Connect an existing wallet" }).click();
  await expect(page.getByText("Connect Wallet", { exact: true })).toBeVisible();

  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});
