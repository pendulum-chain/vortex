import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { supabase, supabaseAdmin } from "../../../config/supabase";
import { AccessTokenVerificationError, SupabaseAuthService } from "./supabase.service";

afterEach(() => {
  mock.restore();
});

describe("SupabaseAuthService.verifyToken", () => {
  it("uses the least-privileged Auth client and returns the authoritative user", async () => {
    const getUser = spyOn(supabase.auth, "getUser").mockResolvedValue({
      data: { user: { email: "user@example.com", id: "user-1" } },
      error: null
    } as never);
    const adminGetUser = spyOn(supabaseAdmin.auth, "getUser");

    await expect(SupabaseAuthService.verifyToken("access-token")).resolves.toEqual({
      email: "user@example.com",
      user_id: "user-1",
      valid: true
    });
    expect(getUser).toHaveBeenCalledWith("access-token");
    expect(adminGetUser).not.toHaveBeenCalled();
  });

  it("distinguishes a definitive invalid token from an indeterminate provider failure", async () => {
    const getUser = spyOn(supabase.auth, "getUser");
    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "invalid JWT", status: 401 } } as never);
    await expect(SupabaseAuthService.verifyToken("invalid")).resolves.toEqual({ valid: false });

    getUser.mockResolvedValueOnce({ data: { user: null }, error: { message: "upstream unavailable", status: 503 } } as never);
    await expect(SupabaseAuthService.verifyToken("indeterminate")).rejects.toBeInstanceOf(AccessTokenVerificationError);
  });
});
