import { describe, expect, it } from "bun:test";
import express from "express";
import type { AddressInfo } from "node:net";
import onboardingRoutes from "./onboarding.route";

describe("GET /v1/onboarding/requirements", () => {
  it("serves public discovery metadata without authentication", async () => {
    const app = express();
    app.use("/v1/onboarding", onboardingRoutes);
    const server = app.listen(0);
    await new Promise<void>(resolve => server.once("listening", resolve));

    try {
      const { port } = server.address() as AddressInfo;
      const response = await fetch(`http://127.0.0.1:${port}/v1/onboarding/requirements?country=MX&customerType=business`);

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        country: "MX",
        customerType: "business",
        flow: "alfredpay-mx-business-api-kyb",
        provider: "alfredpay"
      });
    } finally {
      server.close();
    }
  });
});
