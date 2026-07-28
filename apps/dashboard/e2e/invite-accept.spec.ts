import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

const EMAIL = "invited@vortexfinance.co";
const OTP_CODE = "123456";
const INVITE_TOKEN = "e2e-invite-token";

// Discount-carrying invites deep-link to the dashboard: the invited user signs in on the
// invite page itself, confirms with the active account shown (links are bearer tokens and
// bind the first acceptor permanently), the account type comes from the invitation (no
// "How will you use Vortex?" step), and the invited corridor card is ready to start.
test("invite deep link: sign in, confirm, accept, land on onboarding with the corridor added", async ({ page }) => {
  const backend = await mockBackend(page, { selectionRequired: true });

  await page.goto(`/invite/${INVITE_TOKEN}`);
  await expect(page.getByText("You've been invited to Vortex")).toBeVisible();

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Verify your email")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially(OTP_CODE);

  // Nothing is redeemed until the user confirms with the active account in view.
  await expect(page.getByText("Accept your invite")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText(EMAIL)).toBeVisible();
  expect(backend.acceptInviteRequests).toEqual([]);
  await page.getByRole("button", { name: "Accept invite" }).click();

  await expect(page).toHaveURL(/\/overview\?invited=MX/, { timeout: 20_000 });
  // The invitation fixed the account type — the selector must never appear.
  await expect(page.getByText("How will you use Vortex?")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByTestId("corridor-card-MX")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start KYC" })).toBeVisible();

  expect(backend.acceptInviteRequests).toEqual([{ token: INVITE_TOKEN }]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("invite deep link: a signed-in user must still confirm before anything is redeemed", async ({ page }) => {
  const backend = await mockBackend(page, { selectionRequired: true });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page.getByText("Accept your invite")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Use a different account" })).toBeVisible();
  expect(backend.acceptInviteRequests).toEqual([]);

  await page.getByRole("button", { name: "Accept invite" }).click();
  await expect(page).toHaveURL(/\/overview\?invited=MX/, { timeout: 20_000 });
  await expect(page.getByTestId("corridor-card-MX")).toBeVisible();
  expect(backend.acceptInviteRequests).toEqual([{ token: INVITE_TOKEN }]);
});

test("invite deep link: 'Use a different account' signs out back to the invite login", async ({ page }) => {
  await mockBackend(page, { selectionRequired: true });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);
  await expect(page.getByText("Accept your invite")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Use a different account" }).click();

  await expect(page.getByText("You've been invited to Vortex")).toBeVisible({ timeout: 20_000 });
  await expect(page).toHaveURL(new RegExp(`/invite/${INVITE_TOKEN}`));
});

test("invite deep link: an account-type mismatch fails before the invite is consumed", async ({ page }) => {
  const backend = await mockBackend(page, {
    invitePreview: { body: { country: "MX", inviteeType: "business", payoutCurrency: "mxn", rail: "mxn" }, status: 200 },
    selectActiveEntityError: {
      body: { error: { code: "ACTIVE_ENTITY_IMMUTABLE", message: "The active customer entity selection cannot be changed" } },
      status: 409
    }
  });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);
  await expect(page.getByText("Accept your invite")).toBeVisible({ timeout: 20_000 });
  await page.getByRole("button", { name: "Accept invite" }).click();

  await expect(page.getByText(/This invite is for a company account/)).toBeVisible({ timeout: 20_000 });
  // The redemption endpoint was never called — the link stays redeemable elsewhere.
  expect(backend.acceptInviteRequests).toEqual([]);
});

test("invite deep link: an expired invite surfaces before confirmation, consuming nothing", async ({ page }) => {
  const backend = await mockBackend(page, {
    invitePreview: { body: { error: { code: "INVITE_EXPIRED", message: "Invite has expired" } }, status: 410 }
  });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page.getByText("This invite could not be opened")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  expect(backend.acceptInviteRequests).toEqual([]);
});
