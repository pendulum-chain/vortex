import { expect, test } from "@playwright/test";
import { mockBackend } from "./support/mockBackend";
import { seedSession } from "./support/session";

// The _app layout route gates every page behind a session (src/routes/_app.tsx), and /login
// bounces an already-authenticated user back out (src/routes/login.tsx).

test("the local server root redirects into the dashboard", async ({ page }) => {
  await page.goto("/");

  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("Connect with Vortex")).toBeVisible();
});

test("an unauthenticated deep link redirects to the login page", async ({ page }) => {
  await mockBackend(page);

  await page.goto("/transfer");

  await expect(page).toHaveURL(/\/login/, { timeout: 20_000 });
  await expect(page.getByText("Connect with Vortex")).toBeVisible();
});

test("a seeded session renders the app shell instead of redirecting", async ({ page }) => {
  const backend = await mockBackend(page);
  await seedSession(page);

  await page.goto("/overview");

  await expect(page.getByRole("heading", { name: "Onboarding" })).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole("link", { name: "New transfer" })).toBeVisible();
  await expect(page).toHaveURL(/\/overview/);

  // Nothing reached for an API route the mock does not serve, and nothing escaped to an
  // unblocked external origin.
  expect(backend.unmatchedRequests).toEqual([]);
  expect(backend.unexpectedExternalRequests).toEqual([]);
});

test("a started onboarding account renders without crashing the overview", async ({ page }) => {
  await mockBackend(page, { onboardingState: "started" });
  await seedSession(page);

  await page.goto("/overview");

  await expect(page.getByText("Started", { exact: true })).toBeVisible({ timeout: 20_000 });
  // A started account is pre-submission and resumable — the card offers an enabled Continue action.
  await expect(page.getByRole("button", { name: "Continue KYC" })).toBeEnabled();
});

test("an authenticated user is redirected away from the login page", async ({ page }) => {
  await mockBackend(page);
  await seedSession(page);

  await page.goto("/login");

  await expect(page).toHaveURL(/\/overview/, { timeout: 20_000 });
});
