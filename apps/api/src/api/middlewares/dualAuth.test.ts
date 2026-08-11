import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { AccessTokenVerificationError, SupabaseAuthService } from "../services/auth";
import { requirePartnerOrUserAuth } from "./dualAuth";

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
