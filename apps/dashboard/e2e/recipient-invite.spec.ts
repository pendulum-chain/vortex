import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("long recipient invite links stay within the share dialog", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/dashboard/recipients");

  await page.getByRole("button", { name: "Add recipient" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel(/I will send you/).fill("100");
  await dialog.getByRole("button", { name: "Create invite link" }).click();

  await expect(dialog.getByText("Invite link ready")).toBeVisible();
  const preview = dialog.getByTestId("invite-link-preview");
  await expect(preview).toHaveCSS("overflow-x", "hidden");
  await expect
    .poll(async () => {
      const [dialogBox, previewBox] = await Promise.all([dialog.boundingBox(), preview.boundingBox()]);
      return !!dialogBox && !!previewBox && previewBox.x + previewBox.width <= dialogBox.x + dialogBox.width;
    })
    .toBe(true);
  expect(backend.unmatchedRequests).toEqual([]);
});
