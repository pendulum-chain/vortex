import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { config } from "../../config/vars";
import ProfileRole from "../../models/profileRole.model";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { SupabaseAuthService } from "../services/auth";
import { createSession } from "../services/impersonation.service";
import { optionalAuth, requireAuth } from "./supabaseAuth";

function request(authorization?: string): Request {
  return {
    headers: authorization === undefined ? {} : { authorization },
    path: "/v1/quote"
  } as Request;
}

function response(): Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> } {
  const res = {} as Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> };
  res.json = mock(() => res);
  res.status = mock(() => res);
  return res;
}

describe("Supabase auth middleware under impersonation", () => {
  const originalImpersonationEnabled = config.impersonationEnabled;

  beforeAll(async () => {
    await setupTestDatabase();
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.impersonationEnabled = true;
  });

  afterEach(() => {
    config.impersonationEnabled = originalImpersonationEnabled;
    mock.restore();
  });

  afterAll(() => {
    config.impersonationEnabled = originalImpersonationEnabled;
  });

  it("requireAuth sets req.userId to the target and attaches req.impersonation", async () => {
    const actor = await createTestUser({ email: "operator@example.com" });
    const target = await createTestUser({ email: "customer@example.com" });
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const req = request(`Bearer ${token}`);
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requireAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe(target.id);
    expect(req.impersonation).toEqual({
      actorProfileId: actor.id,
      expiresAt: session.expiresAt,
      sessionId: session.id,
      targetEmail: target.email,
      targetProfileId: target.id
    });
  });

  it("optionalAuth sets req.userId to the target and attaches req.impersonation", async () => {
    const actor = await createTestUser({ email: "operator2@example.com" });
    const target = await createTestUser({ email: "customer2@example.com" });
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const req = request(`Bearer ${token}`);
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.userId).toBe(target.id);
    expect(req.impersonation?.targetProfileId).toBe(target.id);
  });

  it("sets req.userEmail to the target's email, never the operator's", async () => {
    const actor = await createTestUser({ email: "operator3@example.com" });
    const target = await createTestUser({ email: "customer3@example.com" });
    await ProfileRole.create({ role: "vortex_admin", userId: actor.id });
    const { token } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const req = request(`Bearer ${token}`);
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requireAuth(req, res, next);

    expect(req.userEmail).toBe(target.email);
    expect(req.userEmail).not.toBe(actor.email);
  });

  it("leaves req.impersonation undefined for a plain Supabase-authenticated request", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({
      email: "user@example.com",
      user_id: "user-1",
      valid: true
    });

    const req = request("Bearer plain-supabase-token");
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requireAuth(req, res, next);

    expect(req.userId).toBe("user-1");
    expect(req.impersonation).toBeUndefined();
  });
});
