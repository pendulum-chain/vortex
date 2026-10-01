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
      const response = await fetch(`http://127.0.0.1:${port}/v1/onboarding/requirements?country=MX&customerType=individual`);

      expect(response.status).toBe(200);
      const body = (await response.json()) as Record<string, unknown>;
      expect(body).toMatchObject({
        country: "MX",
        customerType: "individual",
        flow: "mx-individual-api-kyc",
        family: "domestic"
      });
      expect(body).not.toHaveProperty("fields");

      // Business verification is paused in MX and CO, so discovery must not advertise it.
      for (const country of ["MX", "CO"]) {
        const paused = await fetch(`http://127.0.0.1:${port}/v1/onboarding/requirements?country=${country}&customerType=business`);
        expect(paused.status).toBe(404);
      }
    } finally {
      server.close();
    }
  });
});
