import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { SupabaseAuthService } from "../../services/auth";
import { createSession } from "../../services/impersonation.service";
import apiCredentialsRoutes from "./api-credentials.route";

const BASE_PATH = "/v1/api-credentials";

describe("rejectImpersonation wiring on /v1/api-credentials", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, apiCredentialsRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    server?.close();
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = true;
  });

  afterEach(() => {
    mock.restore();
  });

  it("refuses an impersonated caller with 403 IMPERSONATION_NOT_ALLOWED", async () => {
    const actor = await createTestUser();
    const target = await createTestUser();
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const res = await fetch(baseUrl, { headers: { Authorization: `Bearer ${token}` } });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IMPERSONATION_NOT_ALLOWED");
  });

  it("allows a plain authenticated (non-impersonated) caller through", async () => {
    const user = await createTestUser();
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({
      email: user.email,
      user_id: user.id,
      valid: true
    });

    const res = await fetch(baseUrl, { headers: { Authorization: "Bearer plain-supabase-token" } });

    expect(res.status).toBe(200);
  });
});
