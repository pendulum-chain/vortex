import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import express from "express";
import { config } from "../../../config/vars";
import AdminImpersonationSession from "../../../models/adminImpersonationSession.model";
import ProfileRole from "../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import profileRolesRoutes from "../../routes/v1/admin/profile-roles.route";
import { createSession, resolveSession } from "../../services/impersonation.service";

const BASE_PATH = "/v1/admin/profile-roles";
const ADMIN_HEADERS = { Authorization: "Bearer test-admin-secret", "Content-Type": "application/json" };

describe("profile roles admin routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use(BASE_PATH, profileRolesRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}${BASE_PATH}`;
  });

  afterAll(() => {
    server?.close();
  });

  beforeEach(async () => {
    await resetTestDatabase();
  });

  function post(body: unknown, headers: Record<string, string> = ADMIN_HEADERS) {
    return fetch(baseUrl, { body: JSON.stringify(body), headers, method: "POST" });
  }

  it("rejects requests without the admin secret", async () => {
    const response = await post({ role: "discount_manager", userId: crypto.randomUUID() }, { "Content-Type": "application/json" });
    expect(response.status).toBe(401);
  });

  it("rejects an unknown role and an unknown user", async () => {
    const user = await createTestUser();
    const badRole = await post({ role: "superadmin", userId: user.id });
    expect(badRole.status).toBe(400);

    const badUser = await post({ role: "discount_manager", userId: crypto.randomUUID() });
    expect(badUser.status).toBe(404);
  });

  it("grants a role, is idempotent on re-grant, and revokes it", async () => {
    const user = await createTestUser();

    const granted = await post({ role: "discount_manager", userId: user.id });
    expect(granted.status).toBe(201);

    const regranted = await post({ role: "discount_manager", userId: user.id });
    expect(regranted.status).toBe(200);
    expect(await ProfileRole.count({ where: { userId: user.id } })).toBe(1);

    const revoked = await fetch(`${baseUrl}/${user.id}/discount_manager`, { headers: ADMIN_HEADERS, method: "DELETE" });
    expect(revoked.status).toBe(204);
    expect(await ProfileRole.count({ where: { userId: user.id } })).toBe(0);

    const revokedAgain = await fetch(`${baseUrl}/${user.id}/discount_manager`, { headers: ADMIN_HEADERS, method: "DELETE" });
    expect(revokedAgain.status).toBe(404);
  });

  it("rejects granting vortex_admin via HTTP but still allows discount_manager", async () => {
    const user = await createTestUser();

    const blocked = await post({ role: "vortex_admin", userId: user.id });
    expect(blocked.status).toBe(403);
    const body = (await blocked.json()) as { error: { code: string } };
    expect(body.error.code).toBe("ROLE_NOT_HTTP_GRANTABLE");
    expect(await ProfileRole.count({ where: { role: "vortex_admin", userId: user.id } })).toBe(0);

    const allowed = await post({ role: "discount_manager", userId: user.id });
    expect(allowed.status).toBe(201);
  });

  it("still allows revoking vortex_admin even though it cannot be granted via HTTP", async () => {
    const user = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: user.id });

    const revoked = await fetch(`${baseUrl}/${user.id}/vortex_admin`, { headers: ADMIN_HEADERS, method: "DELETE" });
    expect(revoked.status).toBe(204);
    expect(await ProfileRole.count({ where: { userId: user.id } })).toBe(0);
  });

  it("revokes every live impersonation session when vortex_admin is removed", async () => {
    const originalImpersonationEnabled = config.impersonationEnabled;
    config.impersonationEnabled = true;
    try {
      const admin = await createTestUser();
      const firstTarget = await createTestUser();
      const secondTarget = await createTestUser();
      await ProfileRole.create({ role: "vortex_admin", userId: admin.id });
      const first = await createSession({ actorProfileId: admin.id, targetProfileId: firstTarget.id });
      const second = await createSession({ actorProfileId: admin.id, targetProfileId: secondTarget.id });

      const response = await fetch(`${baseUrl}/${admin.id}/vortex_admin`, {
        headers: ADMIN_HEADERS,
        method: "DELETE"
      });

      expect(response.status).toBe(204);
      const sessions = await AdminImpersonationSession.findAll({ where: { actorProfileId: admin.id } });
      expect(sessions.every(session => session.revokedAt !== null)).toBe(true);
      expect(sessions.every(session => session.revokedReason === "vortex_admin_role_revoked")).toBe(true);
      expect(await resolveSession(first.token)).toBeNull();
      expect(await resolveSession(second.token)).toBeNull();
    } finally {
      config.impersonationEnabled = originalImpersonationEnabled;
    }
  });

  it("addresses the profile by email as well as by id", async () => {
    const user = await createTestUser({ email: "manager@example.com" });

    const granted = await post({ email: "manager@example.com", role: "discount_manager" });
    expect(granted.status).toBe(201);
    const body = (await granted.json()) as { role: { userId: string } };
    expect(body.role.userId).toBe(user.id);

    const unknown = await post({ email: "ghost@example.com", role: "discount_manager" });
    expect(unknown.status).toBe(404);

    const revoked = await fetch(`${baseUrl}/${encodeURIComponent("manager@example.com")}/discount_manager`, {
      headers: ADMIN_HEADERS,
      method: "DELETE"
    });
    expect(revoked.status).toBe(204);
    expect(await ProfileRole.count({ where: { userId: user.id } })).toBe(0);
  });
});
