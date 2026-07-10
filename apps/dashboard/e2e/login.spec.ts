import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { E2E_USER_ID, SESSION_KEYS } from "./support/session";

const EMAIL = "e2e@vortexfinance.co";
const OTP_CODE = "123456";

// The dashboard's only unauthenticated entry point: email -> OTP -> /overview, against the
// mocked /v1/auth/* endpoints. Every other spec skips this by seeding the session directly
// (e2e/support/session.ts), so the session this flow writes to localStorage is asserted here.
test("login: email, OTP, lands on the overview with a stored session", async ({ page }) => {
  const backend = await mockBackend(page);

  await page.goto("/dashboard/login");
  await expect(page.getByText("Connect with Vortex")).toBeVisible();

  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();

  // The OTP step replaces the email form in the same card.
  await expect(page.getByText("Verify your email")).toBeVisible({ timeout: 20_000 });

  // input-otp renders a single hidden input; entering the 6th digit fires onComplete, which
  // submits without a click (AuthOtpStep wires onComplete={onVerify}).
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially(OTP_CODE);

  await expect(page).toHaveURL(/\/dashboard\/overview/, { timeout: 20_000 });
  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible();

  expect(backend.requestOtpRequests).toEqual([{ email: EMAIL }]);
  expect(backend.verifyOtpRequests).toEqual([{ email: EMAIL, token: OTP_CODE }]);

  // The session the rest of the suite seeds by hand is the one this flow actually writes.
  const session = await page.evaluate(
    keys => ({
      accessToken: localStorage.getItem(keys.accessToken),
      userEmail: localStorage.getItem(keys.userEmail),
      userId: localStorage.getItem(keys.userId)
    }),
    SESSION_KEYS
  );
  expect(session).toEqual({ accessToken: "e2e-access-token", userEmail: EMAIL, userId: E2E_USER_ID });
});

test("login: a rejected OTP surfaces an error and keeps the user signed out", async ({ page }) => {
  await mockBackend(page, {
    verifyOtp: () => ({ body: { error: "Invalid or expired code" }, status: 401 })
  });

  await page.goto("/dashboard/login");
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByRole("button", { name: "Continue" }).click();

  await expect(page.getByText("Verify your email")).toBeVisible({ timeout: 20_000 });
  await page.locator('input[autocomplete="one-time-code"]').pressSequentially(OTP_CODE);

  // The toast carries the backend's message; the route gate keeps us on /login.
  await expect(page.getByText("Verification failed")).toBeVisible({ timeout: 20_000 });
  await expect(page.getByText("Invalid or expired code")).toBeVisible();
  await expect(page).toHaveURL(/\/dashboard\/login/);

  const accessToken = await page.evaluate(key => localStorage.getItem(key), SESSION_KEYS.accessToken);
  expect(accessToken).toBeNull();
});
