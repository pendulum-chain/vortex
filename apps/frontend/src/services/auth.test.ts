// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth";

describe("widget auth session bridge", () => {
  beforeEach(() => localStorage.clear());

  it("notifies CDP subscribers when access tokens change and on logout", () => {
    const listener = vi.fn();
    const unsubscribe = AuthService.subscribe(listener);
    const tokens = {
      accessToken: "access-one",
      refreshToken: "refresh-one",
      userId: "user-one"
    };

    AuthService.storeTokens(tokens);
    AuthService.storeTokens({ ...tokens, accessToken: "access-two" });
    AuthService.clearTokens();
    unsubscribe();
    AuthService.storeTokens(tokens);

    expect(listener).toHaveBeenCalledTimes(3);
  });

  it("returns the current JWT to CDP while it remains fresh", async () => {
    const accessToken = "header.eyJleHAiOjQxMDI0NDQ4MDB9.signature";
    AuthService.storeTokens({ accessToken, refreshToken: "refresh", userId: "user" });

    await expect(AuthService.getFreshAccessToken()).resolves.toBe(accessToken);
  });
});
