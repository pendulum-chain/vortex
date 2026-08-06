import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import express, { Request, Response } from "express";
import { config } from "../../config/vars";
import ProfileRole from "../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { SupabaseAuthService } from "../services/auth";
import { createSession } from "../services/impersonation.service";
import { requireVortexAdmin } from "./vortexAdminAuth";

describe("requireVortexAdmin", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  const originalImpersonationEnabled = config.impersonationEnabled;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use("/protected", requireVortexAdmin, (_req: Request, res: Response) => {
      res.status(200).json({ ok: true });
    });
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}/protected`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  afterEach(() => {
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  it("rejects a profile without the vortex_admin role", async () => {
    const user = await createTestUser();
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ email: user.email, user_id: user.id, valid: true });

    const response = await fetch(baseUrl, { headers: { Authorization: "Bearer whatever" } });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("VORTEX_ADMIN_REQUIRED");
  });

  it("passes a profile that holds the vortex_admin role", async () => {
    const user = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: user.id });
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ email: user.email, user_id: user.id, valid: true });

    const response = await fetch(baseUrl, { headers: { Authorization: "Bearer whatever" } });
    expect(response.status).toBe(200);
  });

  it("rejects an impersonated caller even when the target holds the role", async () => {
    config.impersonationEnabled = true;
    const admin = await createTestUser();
    const target = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: admin.id });
    await ProfileRole.create({ role: "vortex_admin", userId: target.id });

    const { token } = await createSession({ actorProfileId: admin.id, targetProfileId: target.id });

    const response = await fetch(baseUrl, { headers: { Authorization: `Bearer ${token}` } });
    expect(response.status).toBe(403);
    const body = (await response.json()) as { error: { code: string } };
    expect(body.error.code).toBe("IMPERSONATION_NOT_ALLOWED");
  });
});
