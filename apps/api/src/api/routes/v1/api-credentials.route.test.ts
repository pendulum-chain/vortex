import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import ProfileRole from "../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { SupabaseAuthService } from "../../services/auth";
import { createSession } from "../../services/impersonation.service";
import apiCredentialsRoutes from "./api-credentials.route";
import managedProfilesRoutes from "./managed-profiles.route";

const BASE_PATH = "/v1/api-credentials";

describe("rejectImpersonation wiring on credential routes", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, apiCredentialsRoutes);
    app.use("/v1/managed-profiles", managedProfilesRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}`;
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
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const res = await fetch(`${baseUrl}${BASE_PATH}`, {
      headers: { Authorization: `Bearer ${token}` },
      method: "POST"
    });

    expect(res.status).toBe(403);
    const body = (await res.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IMPERSONATION_NOT_ALLOWED");
  });

  it("refuses managed-profile credential creation while impersonating", async () => {
    const actor = await createTestUser();
    const target = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const res = await fetch(`${baseUrl}/v1/managed-profiles/${crypto.randomUUID()}/api-credentials`, {
      headers: { Authorization: `Bearer ${token}` },
      method: "POST"
    });

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

    const res = await fetch(`${baseUrl}${BASE_PATH}`, { headers: { Authorization: "Bearer plain-supabase-token" } });

    expect(res.status).toBe(200);
  });
});
