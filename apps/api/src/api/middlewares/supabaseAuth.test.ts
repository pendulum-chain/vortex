import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import type { NextFunction, Request, Response } from "express";
import { AccessTokenVerificationError, SupabaseAuthService } from "../services/auth";
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

afterEach(() => {
  mock.restore();
});

describe("Supabase authentication middleware", () => {
  it("continues anonymously only when optional auth receives no credential", async () => {
    const verify = spyOn(SupabaseAuthService, "verifyToken");
    const req = request();
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await optionalAuth(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(verify).not.toHaveBeenCalled();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a present malformed or invalid optional credential with 401", async () => {
    const verify = spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({ valid: false });

    for (const authorization of ["Basic value", "Bearer ", "Bearer invalid"]) {
      const res = response();
      const next = mock(() => undefined) as NextFunction;
      await optionalAuth(request(authorization), res, next);
      expect(res.status).toHaveBeenCalledWith(401);
      expect(next).not.toHaveBeenCalled();
    }
    expect(verify).toHaveBeenCalledTimes(1);
  });

  it("returns 503 without anonymous fallback when verification is indeterminate", async () => {
    spyOn(SupabaseAuthService, "verifyToken").mockRejectedValue(
      new AccessTokenVerificationError("provider unavailable", true)
    );
    const res = response();
    const next = mock(() => undefined) as NextFunction;

    await optionalAuth(request("Bearer valid-looking"), res, next);

    expect(res.status).toHaveBeenCalledWith(503);
    expect(next).not.toHaveBeenCalled();
  });

  it("attaches a valid optional identity and applies the same outage distinction to required auth", async () => {
    const verify = spyOn(SupabaseAuthService, "verifyToken").mockResolvedValue({
      email: "user@example.com",
      user_id: "user-1",
      valid: true
    });
    const optionalRequest = request("Bearer valid");
    const optionalResponse = response();
    const optionalNext = mock(() => undefined) as NextFunction;

    await optionalAuth(optionalRequest, optionalResponse, optionalNext);

    expect(optionalRequest.userId).toBe("user-1");
    expect(optionalRequest.userEmail).toBe("user@example.com");
    expect(optionalNext).toHaveBeenCalledTimes(1);

    verify.mockRejectedValueOnce(new AccessTokenVerificationError("provider unavailable", true));
    const requiredResponse = response();
    await requireAuth(request("Bearer valid"), requiredResponse, mock(() => undefined) as NextFunction);
    expect(requiredResponse.status).toHaveBeenCalledWith(503);
  });
});
