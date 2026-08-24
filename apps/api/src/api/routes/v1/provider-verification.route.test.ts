import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import ProfileRole from "../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { handler as errorHandler } from "../../middlewares/error";
import { createSession } from "../../services/impersonation.service";
import alfredpayRoutes from "./alfredpay.route";
import brlaKycImportRoutes from "./brla-kyc-import.route";
import brlaRoutes from "./brla.route";
import moneriumRoutes from "./monerium.route";
import mykoboRoutes from "./mykobo.route";
import onboardingRoutes from "./onboarding.route";

describe("provider verification routes while acting as another profile", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use("/v1/brla/kyc/import-token", brlaKycImportRoutes);
    app.use(express.json());
    app.use("/v1/alfredpay", alfredpayRoutes);
    app.use("/v1/brla", brlaRoutes);
    app.use("/v1/monerium", moneriumRoutes);
    app.use("/v1/mykobo", mykoboRoutes);
    app.use("/v1/onboarding", onboardingRoutes);
    app.use(errorHandler);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}/v1`;
  });

  afterAll(() => {
    server?.close();
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = true;
  });

  async function impersonationHeaders(): Promise<Record<string, string>> {
    const actor = await createTestUser();
    const target = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });
    return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
  }

  it("rejects KYC/KYB actions for every dashboard provider before controller execution", async () => {
    const headers = await impersonationHeaders();
    const countryBody = JSON.stringify({ country: "MX" });
    const requests = [
      { body: countryBody, method: "POST", path: "/alfredpay/createIndividualCustomer" },
      { method: "GET", path: "/alfredpay/getKycRedirectLink?country=MX" },
      { body: countryBody, method: "POST", path: "/alfredpay/kycRedirectOpened" },
      { body: countryBody, method: "POST", path: "/alfredpay/kycRedirectFinished" },
      { body: countryBody, method: "POST", path: "/alfredpay/retryKyc" },
      { body: countryBody, method: "POST", path: "/alfredpay/createBusinessCustomer" },
      { method: "GET", path: "/alfredpay/getKybRedirectLink?country=MX" },
      { body: countryBody, method: "POST", path: "/alfredpay/submitKycInformation" },
      { method: "POST", path: "/alfredpay/submitKycFile" },
      { body: countryBody, method: "POST", path: "/alfredpay/sendKycSubmission" },
      { body: countryBody, method: "POST", path: "/alfredpay/submitKybInformation" },
      { method: "POST", path: "/alfredpay/submitKybFile" },
      { method: "POST", path: "/alfredpay/submitKybRelatedPersonFile" },
      { body: countryBody, method: "POST", path: "/alfredpay/sendKybSubmission" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/createSubaccount" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/getUploadUrls" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/newKyc" },
      { method: "GET", path: "/brla/getSelfieLivenessUrl" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyb/new-level-1/web-sdk" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyb/documents" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyb/ubos" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyb/new-level-1/api" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyc/record-attempt" },
      { body: JSON.stringify({}), method: "POST", path: "/brla/kyc/import-token" },
      { body: JSON.stringify({}), method: "POST", path: "/monerium/oauth/start" },
      { body: JSON.stringify({}), method: "POST", path: "/monerium/oauth/complete" },
      { body: JSON.stringify({}), method: "POST", path: "/mykobo/profiles" }
    ];

    for (const request of requests) {
      const response = await fetch(`${baseUrl}${request.path}`, { body: request.body, headers, method: request.method });

      expect(response.status).toBe(403);
      expect(await response.json()).toMatchObject({ error: { code: "IMPERSONATION_NOT_ALLOWED" } });
    }
  });

  it("keeps aggregate KYC/KYB status readable while impersonating", async () => {
    const headers = await impersonationHeaders();

    const response = await fetch(`${baseUrl}/onboarding/status`, { headers });

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ entities: [] });
  });
});
