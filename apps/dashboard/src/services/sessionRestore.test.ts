import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthTokens } from "./auth";
import { restoreAuthSession } from "./sessionRestore";

const TOKENS: AuthTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  userEmail: "user@example.com",
  userId: "stored-user"
};

describe("restoreAuthSession", () => {
  it("keeps a verified access-token session without refreshing", async () => {
    let refreshes = 0;
    const restored = await restoreAuthSession({
      refresh: async () => {
        refreshes += 1;
        return null;
      },
      tokens: TOKENS,
      verify: async () => ({ userId: "verified-user", valid: true })
    });

    assert.deepEqual(restored, { ...TOKENS, userId: "verified-user" });
    assert.equal(refreshes, 0);
  });

  it("refreshes an invalid access-token session", async () => {
    const refreshed = { ...TOKENS, accessToken: "rotated-access", refreshToken: "rotated-refresh" };
    const restored = await restoreAuthSession({
      refresh: async () => refreshed,
      tokens: TOKENS,
      verify: async () => ({ valid: false })
    });

    assert.deepEqual(restored, refreshed);
  });

  it("ends a session when its refresh token is confirmed invalid", async () => {
    const restored = await restoreAuthSession({
      refresh: async () => null,
      tokens: TOKENS,
      verify: async () => ({ valid: false })
    });

    assert.equal(restored, null);
  });

  it("preserves stored tokens when refresh fails transiently", async () => {
    const restored = await restoreAuthSession({
      refresh: async () => {
        throw new Error("network unavailable");
      },
      tokens: TOKENS,
      verify: async () => {
        throw new Error("verification unavailable");
      }
    });

    assert.equal(restored, TOKENS);
  });
});
