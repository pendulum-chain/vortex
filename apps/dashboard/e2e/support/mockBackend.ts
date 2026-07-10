import type { Page } from "@playwright/test";
import { E2E_USER_ID } from "./session";

/**
 * One approved MX/Alfredpay account under an individual entity, as served by
 * GET /v1/onboarding/status (OnboardingStatusResponse in src/services/api/onboarding.service.ts).
 * corridorFromProviderAccount resolves by rail first, then provider + country — both are set
 * here so the corridor maps to MX whichever branch runs.
 */
export function buildOnboardingStatus() {
  return {
    entities: [
      {
        accounts: [
          {
            country: "MX",
            customerType: "individual",
            id: "acct-e2e-mx",
            kycCase: null,
            provider: "alfredpay",
            rail: "mxn",
            state: "approved",
            status: "approved"
          }
        ],
        id: "entity-e2e-1",
        status: "approved",
        type: "individual"
      }
    ]
  };
}

interface MockBackendOptions {
  // Full response for POST /v1/auth/verify-otp. Default: a successful session.
  verifyOtp?: (requestBody: Record<string, unknown>) => { status: number; body: unknown };
}

/**
 * Intercepts the API origin (http://localhost:3000) so the auth specs run without a backend,
 * and blocks the ConnectKit/WalletConnect endpoints the always-mounted WagmiProvider reaches
 * for. Unmatched API paths 404 and are recorded, so a route this app starts calling cannot
 * silently escape to a real server.
 */
export async function mockBackend(page: Page, options: MockBackendOptions = {}) {
  const requestOtpRequests: Array<Record<string, unknown>> = [];
  const verifyOtpRequests: Array<Record<string, unknown>> = [];
  const unmatchedRequests: string[] = [];

  await page.route("http://localhost:3000/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    const fulfillJson = (body: unknown, status = 200) => route.fulfill({ json: body as object, status });

    // Auth shapes mirror apps/api/src/api/controllers/auth.controller.ts: snake_case on the
    // wire, mapped to camelCase by src/services/api/auth.api.ts.
    if (path === "/v1/auth/request-otp" && method === "POST") {
      requestOtpRequests.push(request.postDataJSON() as Record<string, unknown>);
      await fulfillJson({ message: "OTP sent" });
      return;
    }
    if (path === "/v1/auth/verify-otp" && method === "POST") {
      const body = request.postDataJSON() as Record<string, unknown>;
      verifyOtpRequests.push(body);
      const result = options.verifyOtp?.(body) ?? {
        body: {
          access_token: "e2e-access-token",
          refresh_token: "e2e-refresh-token",
          success: true,
          user_id: E2E_USER_ID
        },
        status: 200
      };
      await fulfillJson(result.body, result.status);
      return;
    }
    if (path === "/v1/auth/refresh" && method === "POST") {
      await fulfillJson({ access_token: "e2e-access-token", refresh_token: "e2e-refresh-token", success: true });
      return;
    }

    if (path === "/v1/onboarding/status" && method === "GET") {
      await fulfillJson(buildOnboardingStatus());
      return;
    }

    unmatchedRequests.push(`${method} ${path}`);
    await route.fulfill({ json: {}, status: 404 });
  });

  // main.tsx always mounts WagmiProvider + ConnectKitProvider, and the Topbar renders a connect
  // button — so these are reached even though no spec connects a wallet. The app renders fine
  // without them.
  for (const pattern of ["**/*.walletconnect.com/**", "**/*.walletconnect.org/**", "**/*.web3modal.org/**"]) {
    await page.route(pattern, route => route.abort());
  }

  return { requestOtpRequests, unmatchedRequests, verifyOtpRequests };
}
