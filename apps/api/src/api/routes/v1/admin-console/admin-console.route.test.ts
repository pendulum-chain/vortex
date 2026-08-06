import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, spyOn } from "bun:test";
import express from "express";
import { config } from "../../../../config/vars";
import AdminImpersonationSession from "../../../../models/adminImpersonationSession.model";
import ProfileRole from "../../../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../../../test-utils/db";
import { createTestAlfredpayCustomer, createTestUser } from "../../../../test-utils/factories";
import { SupabaseAuthService } from "../../../services/auth";
import { createSession } from "../../../services/impersonation.service";
import accountsRoutes from "./accounts.route";
import impersonationRoutes from "./impersonation.route";

describe("admin-console routes", () => {
  let server: ReturnType<typeof express.application.listen>;
  let baseUrl: string;
  const originalImpersonationEnabled = config.impersonationEnabled;

  beforeAll(async () => {
    await setupTestDatabase();

    const app = express();
    app.use(express.json());
    app.use("/v1/admin-console/accounts", accountsRoutes);
    app.use("/v1/admin-console/impersonation", impersonationRoutes);
    server = app.listen(0);
    const address = server.address();
    if (!address || typeof address === "string") {
      throw new Error("Could not bind test server");
    }
    baseUrl = `http://127.0.0.1:${address.port}/v1/admin-console`;
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

  async function createAdmin() {
    const admin = await createTestUser();
    await ProfileRole.create({ role: "vortex_admin", userId: admin.id });
    return admin;
  }

  function authAs(user: { id: string; email: string }) {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ email: user.email, user_id: user.id, valid: true });
    return { Authorization: "Bearer whatever" };
  }

  describe("GET /accounts", () => {
    it("lists a profile with its entities and verification summary", async () => {
      const admin = await createAdmin();
      const target = await createTestUser();
      await createTestAlfredpayCustomer(target.id);
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/accounts?search=${encodeURIComponent(target.email)}`, { headers });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        accounts: { id: string; entities: { id: string }[]; verificationSummary: Record<string, number> }[];
      };
      const account = body.accounts.find(a => a.id === target.id);
      expect(account).toBeDefined();
      expect(account?.entities.length).toBe(1);
      expect(account?.verificationSummary.approved).toBe(1);
    });

    it("returns full detail for a single profile", async () => {
      const admin = await createAdmin();
      const target = await createTestUser();
      await createTestAlfredpayCustomer(target.id);
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/accounts/${target.id}`, { headers });
      expect(response.status).toBe(200);
      const body = (await response.json()) as {
        id: string;
        entities: { providerCustomers: { provider: string }[] }[];
        impersonationSessions: unknown[];
      };
      expect(body.id).toBe(target.id);
      expect(body.entities.length).toBe(1);
      expect(body.entities[0].providerCustomers[0].provider).toBe("alfredpay");
      expect(body.impersonationSessions).toEqual([]);
    });

    it("returns 404 for an unknown profile", async () => {
      const admin = await createAdmin();
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/accounts/${crypto.randomUUID()}`, { headers });
      expect(response.status).toBe(404);
    });
  });

  describe("POST /impersonation", () => {
    it("returns a token exactly once on the happy path", async () => {
      config.impersonationEnabled = true;
      const admin = await createAdmin();
      const target = await createTestUser();
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/impersonation`, {
        body: JSON.stringify({ targetProfileId: target.id }),
        headers: { ...headers, "Content-Type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(201);
      const body = (await response.json()) as { token: string; sessionId: string; expiresAt: string; target: { id: string } };
      expect(typeof body.token).toBe("string");
      expect(body.token.length).toBeGreaterThan(0);
      expect(body.target.id).toBe(target.id);

      const session = await AdminImpersonationSession.findByPk(body.sessionId);
      expect(session).not.toBeNull();
      // The raw token is never persisted — only its hash.
      expect(session?.tokenHash).not.toBe(body.token);
    });

    it("maps the impersonation kill switch to 503", async () => {
      config.impersonationEnabled = false;
      const admin = await createAdmin();
      const target = await createTestUser();
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/impersonation`, {
        body: JSON.stringify({ targetProfileId: target.id }),
        headers: { ...headers, "Content-Type": "application/json" },
        method: "POST"
      });

      expect(response.status).toBe(503);
      const body = (await response.json()) as { error: { code: string } };
      expect(body.error.code).toBe("IMPERSONATION_DISABLED");
    });
  });

  describe("DELETE /impersonation/:sessionId while impersonating", () => {
    it("allows an impersonated caller to end its own session", async () => {
      config.impersonationEnabled = true;
      const admin = await createAdmin();
      const target = await createTestUser();
      const { token, session } = await createSession({ actorProfileId: admin.id, targetProfileId: target.id });

      const response = await fetch(`${baseUrl}/impersonation/${session.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "DELETE"
      });

      expect(response.status).toBe(204);
      const reloaded = await AdminImpersonationSession.findByPk(session.id);
      expect(reloaded?.revokedAt).not.toBeNull();
    });

    it("refuses an impersonated caller ending a different session", async () => {
      config.impersonationEnabled = true;
      const admin = await createAdmin();
      const targetA = await createTestUser();
      const targetB = await createTestUser();
      const { token } = await createSession({ actorProfileId: admin.id, targetProfileId: targetA.id });
      const { session: otherSession } = await createSession({
        actorProfileId: admin.id,
        targetProfileId: targetB.id
      });

      const response = await fetch(`${baseUrl}/impersonation/${otherSession.id}`, {
        headers: { Authorization: `Bearer ${token}` },
        method: "DELETE"
      });

      expect(response.status).toBe(403);
      const reloaded = await AdminImpersonationSession.findByPk(otherSession.id);
      expect(reloaded?.revokedAt).toBeNull();
    });

    it("refuses an impersonated caller from reaching GET /accounts or POST /impersonation", async () => {
      config.impersonationEnabled = true;
      const admin = await createAdmin();
      const target = await createTestUser();
      const { token } = await createSession({ actorProfileId: admin.id, targetProfileId: target.id });

      const accountsResponse = await fetch(`${baseUrl}/accounts`, { headers: { Authorization: `Bearer ${token}` } });
      expect(accountsResponse.status).toBe(403);

      const postResponse = await fetch(`${baseUrl}/impersonation`, {
        body: JSON.stringify({ targetProfileId: target.id }),
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        method: "POST"
      });
      expect(postResponse.status).toBe(403);
    });

    it("still allows a non-impersonated vortex_admin to revoke any session", async () => {
      config.impersonationEnabled = true;
      const admin = await createAdmin();
      const target = await createTestUser();
      const { session } = await createSession({ actorProfileId: admin.id, targetProfileId: target.id });
      const headers = authAs(admin);

      const response = await fetch(`${baseUrl}/impersonation/${session.id}`, { headers, method: "DELETE" });
      expect(response.status).toBe(204);
    });
  });
});
