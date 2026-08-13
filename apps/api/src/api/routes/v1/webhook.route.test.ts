import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import * as apiKeyAuthHelpers from "../../middlewares/apiKeyAuth.helpers";
import webhookRoutes from "./webhook.route";

const SECRET_KEY = `sk_test_${"a".repeat(32)}`;

describe("managed child webhook access", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(() => {
    const app = express();
    app.use(express.json());
    app.use("/v1/webhook", webhookRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("Could not bind test server");
    baseUrl = `http://127.0.0.1:${address.port}/v1/webhook`;
  });

  afterEach(() => mock.restore());
  afterAll(() => server.close());

  it("rejects direct managed child credentials", async () => {
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-1",
      credential: {
        credentialId: "credential-1",
        environment: "test",
        managedProfile: {
          allowedCorridors: ["BR"],
          allowedCustomerTypes: null,
          controllingManagerProfileId: "11111111-1111-4111-8111-111111111111",
          relationshipId: "relationship-1"
        },
        partnerId: null,
        profileId: "22222222-2222-4222-8222-222222222222",
        strength: "secret"
      },
      partner: null
    });

    const response = await fetch(baseUrl, {
      body: JSON.stringify({ quoteId: crypto.randomUUID(), url: "https://example.com/webhook" }),
      headers: { "Content-Type": "application/json", "X-API-Key": SECRET_KEY },
      method: "POST"
    });

    expect(response.status).toBe(403);
  });

  it("rejects a managed profile selection instead of registering a manager-scoped webhook", async () => {
    spyOn(apiKeyAuthHelpers, "validateApiKey").mockResolvedValue({
      apiKeyId: "credential-2",
      credential: {
        credentialId: "credential-2",
        environment: "test",
        partnerId: null,
        profileId: "33333333-3333-4333-8333-333333333333",
        strength: "secret"
      },
      partner: null
    });

    const response = await fetch(baseUrl, {
      body: JSON.stringify({ quoteId: crypto.randomUUID(), url: "https://example.com/webhook" }),
      headers: {
        "Content-Type": "application/json",
        "X-API-Key": SECRET_KEY,
        "X-Managed-Profile-Id": "44444444-4444-4444-8444-444444444444"
      },
      method: "POST"
    });

    expect(response.status).toBe(400);
    expect((await response.json()).error.code).toBe("MANAGED_PROFILE_UNSUPPORTED");
  });
});
