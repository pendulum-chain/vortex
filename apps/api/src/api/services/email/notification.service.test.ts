import { describe, expect, it } from "bun:test";
import { nextRetryAt } from "./notification.service";

// The schedule the queue documents is 1/5/15/60/180 minutes. It is expressed here in
// minutes-from-now because that is what the caller stores as `next_attempt_at`.
function delayMinutes(attempts: number): number | null {
  const at = nextRetryAt(attempts);
  return at === null ? null : Math.round((at.getTime() - Date.now()) / 60_000);
}

describe("nextRetryAt", () => {
  it("walks the full documented backoff schedule", () => {
    expect([1, 2, 3, 4, 5].map(delayMinutes)).toEqual([1, 5, 15, 60, 180]);
  });

  // A cap of 5 abandoned the row on the attempt that should have waited 180 minutes,
  // so the last backoff step was never actually used.
  it("reaches the 180-minute step before abandoning", () => {
    expect(delayMinutes(5)).toBe(180);
    expect(nextRetryAt(6)).toBeNull();
  });

  it("abandons past the cap rather than indexing off the end of the schedule", () => {
    expect(nextRetryAt(7)).toBeNull();
    expect(nextRetryAt(99)).toBeNull();
  });
});
