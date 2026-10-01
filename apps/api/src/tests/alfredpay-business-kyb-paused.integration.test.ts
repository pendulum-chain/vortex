import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock } from "bun:test";
import { AlfredpayApiService } from "@vortexfi/shared";
import { resetTestDatabase, setupTestDatabase } from "../test-utils/db";
import { createTestUser } from "../test-utils/factories";
import { type FakeSupabaseAuth, installFakeSupabaseAuth, testUserToken } from "../test-utils/fake-world/fake-auth";
import { startTestApp, type TestApp } from "../test-utils/test-app";

// MX/CO business verification is paused until our KYB contract carries the fields Alfred's new
// platform requires; a partner calling the API directly must get a clear answer instead of a business
// customer whose KYB submission can only fail.

let api: TestApp;
let fakeAuth: FakeSupabaseAuth;
const realGetInstance = AlfredpayApiService.getInstance;

beforeAll(async () => {
  await setupTestDatabase();
  fakeAuth = installFakeSupabaseAuth();
  api = await startTestApp();
});

afterAll(async () => {
  await api.close();
  fakeAuth.restore();
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterEach(() => {
  AlfredpayApiService.getInstance = realGetInstance;
});

describe("business verification paused for MX and CO", () => {
  for (const path of ["/v1/alfredpay/createBusinessCustomer", "/v1/co/createBusinessCustomer"]) {
    it(`POST ${path} answers 503 without calling the provider`, async () => {
      const providerCalled = mock(() => {
        throw new Error("provider must not be called");
      });
      AlfredpayApiService.getInstance = providerCalled as unknown as typeof AlfredpayApiService.getInstance;
      const email = `paused-${path.replaceAll("/", "-")}@example.com`;
      const user = await createTestUser({ email });

      const response = await api.request(path, {
        body: JSON.stringify({ country: path.startsWith("/v1/co/") ? undefined : "MX" }),
        headers: { Authorization: `Bearer ${testUserToken(user.id, email)}`, "Content-Type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(503);
      expect(await response.json()).toEqual({
        error: "Business verification in Mexico and Colombia is temporarily unavailable"
      });
      expect(providerCalled).not.toHaveBeenCalled();
    });
  }
});
