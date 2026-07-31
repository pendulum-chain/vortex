import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

test("creates a credential, shows its secret once, and revokes it", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);
  await page.goto("/api-keys");

  await expect(page.getByText("No API credentials yet")).toBeVisible();
  await page.getByRole("button", { name: "Create credential" }).click();

  const createDialog = page.getByRole("dialog");
  await createDialog.getByLabel("Name").fill("Production backend");
  await createDialog.getByRole("button", { name: "Create credential" }).click();

  await expect(createDialog.getByText("Save your credential")).toBeVisible();
  await expect(createDialog.getByRole("textbox", { name: "Secret key" })).toHaveValue(
    "sk_test_abcdefghijklmnopqrstuvwxyz123456"
  );
  await createDialog.getByLabel("I saved the secret key").click();
  await createDialog.getByRole("button", { name: "Done" }).click();

  await expect(page.getByText("Production backend", { exact: true })).toBeVisible();
  await expect(page.getByText("sk_test_abcdefghijklmnopqrstuvwxyz123456")).toHaveCount(0);

  await page.getByRole("button", { name: "Revoke Production backend" }).click();
  const revokeDialog = page.getByRole("dialog");
  await revokeDialog.getByRole("button", { name: "Revoke credential" }).click();

  await expect(page.getByText("Revoked", { exact: true })).toBeVisible();
  await expect(page.getByText("Production backend", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Revoke Production backend" })).toHaveCount(0);
  expect(backend.apiCredentialRequests).toHaveLength(2);
  expect(backend.apiCredentialRequests[1]).toMatchObject({
    body: null,
    method: "DELETE",
    path: "/v1/api-credentials/credential-e2e-1"
  });
  expect(backend.unmatchedRequests).toEqual([]);
});

test("API keys are available without an active sender entity", async ({ page }) => {
  await mockBackend(page, { selectionRequired: true });
  await seedSession(page);
  await page.goto("/api-keys");

  await expect(page.getByRole("heading", { name: "API keys" })).toBeVisible();
  await expect(page.getByText("No API credentials yet")).toBeVisible();
});
