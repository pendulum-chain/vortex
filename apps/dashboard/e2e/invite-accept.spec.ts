import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

const EMAIL = "invited@vortexfinance.co";
const OTP_CODE = "123456";
const INVITE_TOKEN = "e2e-invite-token";

// Discount-carrying invites deep-link to the dashboard: the invited user signs in on the
// invite page itself, the invite is redeemed, the account type comes from the invitation
// (no "How will you use Vortex?" step), and the invited corridor card is ready to start.
test("invite deep link: sign in, accept, land on onboarding with the invited corridor added", async ({ page }) => {
  const backend = await mockBackend(page, { selectionRequired: true });

  await page.goto(`/invite/${INVITE_TOKEN}`);
  await expect(page.getByText("You've been invited to Vortex")).toBeVisible();

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();
  await expect(page.getByText("Verify your email")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially(OTP_CODE);

  await expect(page).toHaveURL(/\/overview\?invited=MX/, { timeout: 20_000 });
  // The invitation fixed the account type — the selector must never appear.
  await expect(page.getByText("How will you use Vortex?")).not.toBeVisible();
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();
  await expect(page.getByTestId("corridor-card-MX")).toBeVisible();
  await expect(page.getByRole("button", { name: "Start KYC" })).toBeVisible();

  expect(backend.acceptInviteRequests).toEqual([{ token: INVITE_TOKEN }]);
  expect(backend.unmatchedRequests).toEqual([]);
});

test("invite deep link: an already signed-in user accepts without re-authenticating", async ({ page }) => {
  const backend = await mockBackend(page, { selectionRequired: true });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page).toHaveURL(/\/overview\?invited=MX/, { timeout: 20_000 });
  await expect(page.getByTestId("corridor-card-MX")).toBeVisible();
  expect(backend.acceptInviteRequests).toEqual([{ token: INVITE_TOKEN }]);
});

test("invite deep link: a failed acceptance surfaces the error with a retry", async ({ page }) => {
  const backend = await mockBackend(page, {
    acceptInvite: { body: { error: { code: "INVITE_EXPIRED", message: "Invite has expired" } }, status: 410 }
  });
  await seedSession(page);

  await page.goto(`/invite/${INVITE_TOKEN}`);

  await expect(page.getByText("This invite could not be accepted")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("button", { name: "Try again" })).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/invite/${INVITE_TOKEN}`));
  expect(backend.acceptInviteRequests).toEqual([{ token: INVITE_TOKEN }]);
});
