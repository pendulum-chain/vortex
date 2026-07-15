import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("long recipient invite links stay within the share dialog", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/recipients");

  await page.getByRole("button", { name: "Add recipient" }).first().click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Alias").fill("Maria · MXN");
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

test("a pending invite row reopens the link for re-copy and removal archives the invitation", async ({ page }) => {
  const backend = await mockBackend(page, {
    pendingInvitations: [
      {
        alias: "Maria · MXN",
        country: "MX",
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        id: "invitation-e2e-1",
        inviteeEmail: null,
        inviteeType: "individual",
        isExpired: false,
        payoutCurrency: "mxn",
        rail: "mxn",
        token: "e2e-recopy-token"
      }
    ]
  });
  await seedSession(page);
  await page.goto("/recipients");

  await page.getByRole("cell", { name: "Maria · MXN" }).click();
  const dialog = page.getByRole("dialog");
  await expect(dialog.getByRole("heading", { name: "Maria · MXN" })).toBeVisible();
  await expect(dialog.getByTestId("invite-link-preview")).toContainText("e2e-recopy-token");

  await dialog.getByRole("button", { name: "Remove from list" }).click();
  await dialog.getByRole("button", { name: "Remove — are you sure?" }).click();

  await expect(dialog).not.toBeVisible();
  expect(backend.archiveInvitationRequests).toEqual([{ archived: true, id: "invitation-e2e-1" }]);
  expect(backend.unmatchedRequests).toEqual([]);
});
