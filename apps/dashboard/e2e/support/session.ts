import type { Page } from "@playwright/test";

export const E2E_USER_ID = "user-e2e-1";
export const E2E_USER_EMAIL = "e2e@vortexfinance.co";
// displayNameFromEmail("e2e@vortexfinance.co") in src/stores/auth.store.ts.
export const E2E_USER_NAME = "E2e";

// Keys mirror AuthService's private constants (src/services/auth.ts).
export const SESSION_KEYS = {
  accessToken: "vortex_dashboard_access_token",
  refreshToken: "vortex_dashboard_refresh_token",
  userEmail: "vortex_dashboard_user_email",
  userId: "vortex_dashboard_user_id"
} as const;

/**
 * Boots the app with a stored session before any app script runs. The default access token is
 * not a JWT on purpose so tests can opt into specific expiry behavior when needed.
 */
export async function seedSession(page: Page, accessToken = "e2e-access-token") {
  await page.addInitScript(
    ({ accessToken: token, email, keys, userId }) => {
      localStorage.setItem(keys.accessToken, token);
      localStorage.setItem(keys.refreshToken, "e2e-refresh-token");
      localStorage.setItem(keys.userId, userId);
      localStorage.setItem(keys.userEmail, email);
    },
    { accessToken, email: E2E_USER_EMAIL, keys: SESSION_KEYS, userId: E2E_USER_ID }
  );
}
