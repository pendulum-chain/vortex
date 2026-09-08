import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { enqueueRampCompletedEmail } from "../api/services/email/ramp-completion";
import type RampState from "../models/rampState.model";
import { pendingBackgroundWorkCount, settleBackgroundWork, trackBackgroundWork } from "./background-work";
import { installBackgroundWorkTracking } from "./fake-world/fake-background-work";

describe("background work registry", () => {
  let tracking: { restore: () => void };

  beforeAll(() => {
    tracking = installBackgroundWorkTracking();
  });

  afterAll(() => {
    tracking.restore();
  });

  it("settles after tracked work finishes, whether it resolved or rejected", async () => {
    let finish: () => void = () => undefined;
    const slow = new Promise<void>(resolve => {
      finish = resolve;
    });
    const failing = Promise.reject(new Error("enqueue failed"));

    // The caller keeps the original promise, so its own error handling still runs.
    expect(trackBackgroundWork(slow)).toBe(slow);
    await expect(trackBackgroundWork(failing)).rejects.toThrow("enqueue failed");
    expect(pendingBackgroundWorkCount()).toBeGreaterThan(0);

    let settled = false;
    const settling = settleBackgroundWork().then(() => {
      settled = true;
    });
    await Promise.resolve();
    expect(settled).toBe(false);

    finish();
    await settling;
    expect(pendingBackgroundWorkCount()).toBe(0);
  });

  it("tracks the phase processor's ramp-completion enqueue through the fake world wrapper", async () => {
    // A ramp without a user returns before touching the database, which is enough to show
    // the call is routed through the registry.
    const enqueue = enqueueRampCompletedEmail({ userId: null } as unknown as RampState);
    expect(pendingBackgroundWorkCount()).toBe(1);

    await enqueue;
    await settleBackgroundWork();
    expect(pendingBackgroundWorkCount()).toBe(0);
  });
});
