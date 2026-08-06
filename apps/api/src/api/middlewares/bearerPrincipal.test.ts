import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import { config } from "../../config/vars";
import { resetTestDatabase, setupTestDatabase } from "../../test-utils/db";
import { createTestUser } from "../../test-utils/factories";
import { SupabaseAuthService } from "../services/auth";
import { createSession, revokeSession } from "../services/impersonation.service";
import { rejectImpersonation, resolveBearerPrincipal } from "./bearerPrincipal";

function response(): Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> } {
  const res = {} as Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> };
  res.status = mock(() => res);
  res.json = mock(() => res);
  return res;
}

describe("resolveBearerPrincipal", () => {
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

  it("resolves a live impersonation token to the target, not the actor", async () => {
    const actor = await createTestUser();
    const target = await createTestUser({ email: "target@example.com" });
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });

    const principal = await resolveBearerPrincipal(token);

    expect(principal).toEqual({
      impersonation: {
        actorProfileId: actor.id,
        expiresAt: session.expiresAt,
        sessionId: session.id,
        targetEmail: target.email,
        targetProfileId: target.id
      },
      userEmail: target.email,
      userId: target.id,
      valid: true
    });
    if (principal.valid) {
      expect(principal.userId).not.toBe(actor.id);
    }
  });

  it("resolves a Supabase token unchanged, with impersonation undefined", async () => {
    const verify = spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({
      email: "user@example.com",
      user_id: "user-1",
      valid: true
    });

    const principal = await resolveBearerPrincipal("some-supabase-token");

    expect(principal).toEqual({ userEmail: "user@example.com", userId: "user-1", valid: true });
    if (principal.valid) {
      expect(principal.impersonation).toBeUndefined();
    }
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("returns invalid for an expired impersonation token", async () => {
    const actor = await createTestUser();
    const target = await createTestUser();
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });
    await session.update({ expiresAt: new Date(Date.now() - 1000) });

    expect(await resolveBearerPrincipal(token)).toEqual({ valid: false });
  });

  it("returns invalid for a revoked impersonation token", async () => {
    const actor = await createTestUser();
    const target = await createTestUser();
    const { token, session } = await createSession({ actorProfileId: actor.id, targetProfileId: target.id });
    await revokeSession(session.id, "manual revoke");

    expect(await resolveBearerPrincipal(token)).toEqual({ valid: false });
  });

  it("returns invalid for an unknown impersonation token", async () => {
    expect(await resolveBearerPrincipal("vtx_imp_unknown-token")).toEqual({ valid: false });
  });
});

describe("rejectImpersonation", () => {
  it("calls next() when the request carries no impersonation context", () => {
    const req = {} as Request;
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    rejectImpersonation(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("responds 403 IMPERSONATION_NOT_ALLOWED and does not call next() when impersonation is set", () => {
    const req = {
      impersonation: {
        actorProfileId: "actor-1",
        expiresAt: new Date(),
        sessionId: "session-1",
        targetEmail: "target@example.com",
        targetProfileId: "target-1"
      }
    } as Request;
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    rejectImpersonation(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(httpStatus.FORBIDDEN);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "IMPERSONATION_NOT_ALLOWED",
        message: "This action is not available while acting as another account.",
        status: httpStatus.FORBIDDEN
      }
    });
  });
});
