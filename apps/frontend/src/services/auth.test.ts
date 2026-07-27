// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "./auth";

describe("widget auth session bridge", () => {
  beforeEach(() => localStorage.clear());

  it("notifies Privy subscribers when access tokens change and on logout", () => {
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
});
