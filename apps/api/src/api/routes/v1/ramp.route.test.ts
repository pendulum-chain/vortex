import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import ProfileRole from "../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { handler as errorHandler } from "../../middlewares/error";
import { createSession } from "../../services/impersonation.service";
import quoteRoutes from "./quote.route";
import rampRoutes from "./ramp.route";

describe("ramp routes under impersonation", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use("/v1/quotes", quoteRoutes);
    app.use("/v1/ramp", rampRoutes);
    app.use(errorHandler);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
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

  it("rejects ramp registration, update, and start while impersonating", async () => {
    const headers = await impersonationHeaders();

    for (const path of ["register", "update", "start"]) {
      const response = await fetch(`${baseUrl}/ramp/${path}`, {
        body: JSON.stringify({}),
        headers,
        method: "POST"
      });

      expect(response.status).toBe(403);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("IMPERSONATION_NOT_ALLOWED");
    }
  });

  it("still allows quote requests to reach normal validation while impersonating", async () => {
    const headers = await impersonationHeaders();

    const response = await fetch(`${baseUrl}/quotes`, {
      body: JSON.stringify({}),
      headers,
      method: "POST"
    });

    expect(response.status).toBe(400);
  });

  it("still allows an impersonated caller to inspect ramp history", async () => {
    const headers = await impersonationHeaders();

    const response = await fetch(`${baseUrl}/ramp/history`, { headers });

    expect(response.status).toBe(200);
  });
});
