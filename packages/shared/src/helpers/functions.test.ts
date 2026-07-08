import { describe, expect, it } from "bun:test";
import { sleep, waitUntilTrue, waitUntilTrueWithTimeout } from "./functions";

describe("waitUntilTrueWithTimeout", () => {
  it("resolves once the condition becomes true", async () => {
    let calls = 0;
    await waitUntilTrueWithTimeout(async () => ++calls >= 3, 5, 1000);
    expect(calls).toBe(3);
  });

  it("rejects on timeout with the legacy 'Timeout ...' message", async () => {
    await expect(waitUntilTrueWithTimeout(async () => false, 5, 30)).rejects.toThrow(/Timeout waiting for condition/);
  });

  // Regression: the old implementation raced the poll loop against a timeout without
  // cancelling it, so every timed-out call leaked a poll loop that ran forever
  // (the production CPU leak of 2026-07). The loop must stop polling after timeout.
  it("stops polling after the timeout fires", async () => {
    let calls = 0;
    await expect(
      waitUntilTrueWithTimeout(
        async () => {
          calls++;
          return false;
        },
        5,
        30
      )
    ).rejects.toThrow(/Timeout/);

    const callsAtTimeout = calls;
    await sleep(60);
    expect(calls).toBe(callsAtTimeout);
  });

  it("stops polling when the caller aborts", async () => {
    let calls = 0;
    const controller = new AbortController();
    const pending = waitUntilTrueWithTimeout(
      async () => {
        calls++;
        return false;
      },
      5,
      10_000,
      controller.signal
    );

    await sleep(20);
    controller.abort(new Error("caller aborted"));
    await expect(pending).rejects.toThrow("caller aborted");

    const callsAtAbort = calls;
    await sleep(60);
    expect(calls).toBe(callsAtAbort);
  });
});

describe("sleep", () => {
  it("rejects immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort(new Error("pre-aborted"));

    const start = Date.now();
    await expect(sleep(10_000, controller.signal)).rejects.toThrow("pre-aborted");
    expect(Date.now() - start).toBeLessThan(1000);
  });
});

describe("waitUntilTrue", () => {
  it("stops polling when the signal aborts", async () => {
    let calls = 0;
    const controller = new AbortController();
    const pending = waitUntilTrue(
      async () => {
        calls++;
        return false;
      },
      5,
      controller.signal
    );

    await sleep(20);
    controller.abort(new Error("stop"));
    await expect(pending).rejects.toThrow("stop");

    const callsAtAbort = calls;
    await sleep(60);
    expect(calls).toBe(callsAtAbort);
  });
});
