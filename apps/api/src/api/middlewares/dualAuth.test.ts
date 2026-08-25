import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { AccessTokenVerificationError, SupabaseAuthService } from "../services/auth";
import { requirePartnerOrUserAuth, requireProfileBoundPrincipal } from "./dualAuth";

function request(authorization: string): Request {
  return {
    headers: { authorization },
    path: "/v1/onboarding/status"
  } as Request;
}

function response(): Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> } {
  const res = {} as Response & { json: ReturnType<typeof mock>; status: ReturnType<typeof mock> };
  res.json = mock(() => res);
  res.status = mock(() => res);
  return res;
}

afterEach(() => {
  mock.restore();
});

describe("dual authentication Bearer verification", () => {
  it("reports a transient provider outage as 503 rather than an internal error", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockRejectedValue(
      new AccessTokenVerificationError("provider unavailable", true)
    );
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requirePartnerOrUserAuth()(request("Bearer valid-looking"), res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("reports a non-transient verification failure as 401", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockRejectedValue(
      new AccessTokenVerificationError("verification failed", false)
    );
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requirePartnerOrUserAuth()(request("Bearer valid-looking"), res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("forwards an unexpected verifier failure instead of misclassifying it as an invalid token", async () => {
    const error = new Error("unexpected SDK failure");
    spyOn(SupabaseAuthService, "verifyToken").mockRejectedValue(error);
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await requirePartnerOrUserAuth()(request("Bearer valid-looking"), res, next);

    expect(next).toHaveBeenCalledWith(error);
    expect(res.status).not.toHaveBeenCalled();
  });

  it("attaches the verified identity when the provider answers", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({
      email: "user@example.com",
      user_id: "user-1",
      valid: true
    });
    const req = request("Bearer valid");
    const next = mock(() => undefined) as NextFunction;

    await requirePartnerOrUserAuth()(req, response(), next);

    expect(req.userId).toBe("user-1");
    expect(next).toHaveBeenCalledTimes(1);
  });
});

describe("requireProfileBoundPrincipal", () => {
  it("accepts a Bearer-authenticated profile", () => {
    const next = mock(() => undefined) as NextFunction;

    requireProfileBoundPrincipal({ userId: "user-1" } as Request, response(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("accepts a profile-bound secret credential", () => {
    const next = mock(() => undefined) as NextFunction;

    requireProfileBoundPrincipal({ authenticatedCredentialProfileId: "profile-1" } as Request, response(), next);

    expect(next).toHaveBeenCalledTimes(1);
  });

  it("rejects an ownerless secret credential before downstream validation", () => {
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    requireProfileBoundPrincipal({ credential: { profileId: null } } as unknown as Request, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({
      error: {
        code: "AUTHENTICATION_REQUIRED",
        message: "A profile-bound secret key or Bearer token is required.",
        status: 401
      }
    });
    expect(next).not.toHaveBeenCalled();
  });
});
