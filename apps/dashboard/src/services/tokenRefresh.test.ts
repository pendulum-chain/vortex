import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { AuthTokens } from "@/services/auth";
import { startTokenRefresh } from "@/services/tokenRefresh";

const TOKENS: AuthTokens = {
  accessToken: "access",
  refreshToken: "refresh",
  userId: "user"
};

function createTimers() {
  const pending: Array<{ callback: () => void | Promise<void>; delay: number }> = [];

  return {
    pending,
    setTimer: (callback: () => void | Promise<void>, delay: number) => {
      const timer = { callback, delay };
      pending.push(timer);
      return timer as unknown as ReturnType<typeof setTimeout>;
    }
  };
}

describe("startTokenRefresh", () => {
  it("refreshes before expiry and reschedules from the rotated token", async () => {
    const timers = createTimers();
    let expiryMs = 121_000;
    let refreshes = 0;

    startTokenRefresh({
      getExpiryMs: () => expiryMs,
      now: () => 1_000,
      onInvalid: () => assert.fail("session should remain valid"),
      refresh: async () => {
        refreshes += 1;
        expiryMs = 241_000;
        return TOKENS;
      },
      setTimer: timers.setTimer
    });

    assert.equal(timers.pending[0]?.delay, 60_000);
    await timers.pending.shift()?.callback();
    assert.equal(refreshes, 1);
    assert.equal(timers.pending[0]?.delay, 180_000);
  });

  it("retries transient refresh failures after 30 seconds", async () => {
    const timers = createTimers();

    startTokenRefresh({
      getExpiryMs: () => 60_000,
      now: () => 0,
      onInvalid: () => assert.fail("transient failures must not log out"),
      refresh: async () => {
        throw new Error("network unavailable");
      },
      setTimer: timers.setTimer
    });

    await timers.pending.shift()?.callback();
    assert.equal(timers.pending[0]?.delay, 30_000);
  });

  it("logs out when the refresh token is confirmed invalid", async () => {
    const timers = createTimers();
    let invalidated = false;

    startTokenRefresh({
      getExpiryMs: () => 60_000,
      now: () => 0,
      onInvalid: () => {
        invalidated = true;
      },
      refresh: async () => null,
      setTimer: timers.setTimer
    });

    await timers.pending.shift()?.callback();
    assert.equal(invalidated, true);
    assert.equal(timers.pending.length, 0);
  });
});
