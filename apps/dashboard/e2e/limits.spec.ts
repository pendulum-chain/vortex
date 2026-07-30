import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("shows monthly limits for approved corridors", async ({ page }) => {
  const backend = await mockBackend(page, { approvedCorridors: ["MX", "BR"] });
  await seedSession(page);
  await page.goto("/limits");

  await expect(page.getByRole("heading", { name: "Limits" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Brazil" })).toBeVisible();
  await expect(page.getByRole("tab", { name: "Mexico" })).toBeVisible();
  await expect(page.getByText("1,250 of 10,000 BRL")).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "On-ramp limit usage" })).toHaveAttribute("aria-valuenow", "12.5");

  await page.getByRole("tab", { name: "Mexico" }).click();
  await expect(page.getByText("500 of 5,000 USDC")).toBeVisible();
  expect(backend.limitsRequests).toEqual([{ corridors: ["BR", "MX"] }]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("places Limits directly below API keys without requesting unapproved corridors", async ({ page }) => {
  const backend = await mockBackend(page, { selectionRequired: true });
  await seedSession(page);
  await page.goto("/limits");

  const apiKeysLink = page.getByRole("link", { name: "API keys" });
  await expect(apiKeysLink.locator("xpath=../following-sibling::li[1]")).toContainText("Limits");
  await expect(page.getByText("Limits will appear here once onboarding is approved for a supported corridor.")).toBeVisible();
  expect(backend.limitsRequests).toEqual([]);
});
