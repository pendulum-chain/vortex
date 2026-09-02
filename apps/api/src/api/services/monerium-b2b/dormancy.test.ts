import { describe, expect, it } from "bun:test";
import { MoneriumAccountStatus } from "../../../models/moneriumAccount.model";
import { DORMANCY_WINDOW_MS, isDormancyCandidate } from "./dormancy";

// Dormancy selection (plan §3, R05; window = registry P5, 60 days). Pure predicate —
// runDormancyGate applies it per active account with its latest confirmed execution.

const NOW = new Date("2026-07-17T12:00:00Z");

function daysAgo(days: number): Date {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000);
}

function account(overrides: Partial<Parameters<typeof isDormancyCandidate>[0]> = {}) {
  return {
    createdAt: daysAgo(365),
    dormantSince: null,
    status: MoneriumAccountStatus.Active,
    ...overrides
  };
}

describe("isDormancyCandidate", () => {
  it("uses a 60-day window (registry P5)", () => {
    expect(DORMANCY_WINDOW_MS).toBe(60 * 24 * 60 * 60 * 1000);
  });

  it("flags an active account whose last confirmed conversion is older than the window", () => {
    expect(isDormancyCandidate(account(), daysAgo(61), NOW)).toBe(true);
  });

  it("does not flag an account with a recent confirmed conversion", () => {
    expect(isDormancyCandidate(account(), daysAgo(59), NOW)).toBe(false);
  });

  it("treats exactly-at-the-window as dormant (inclusive boundary)", () => {
    expect(isDormancyCandidate(account(), daysAgo(60), NOW)).toBe(true);
  });

  it("anchors never-converted accounts on their creation date", () => {
    expect(isDormancyCandidate(account({ createdAt: daysAgo(61) }), null, NOW)).toBe(true);
    expect(isDormancyCandidate(account({ createdAt: daysAgo(10) }), null, NOW)).toBe(false);
  });

  it("never re-flags an account already marked dormant", () => {
    expect(isDormancyCandidate(account({ dormantSince: daysAgo(5) }), daysAgo(90), NOW)).toBe(false);
  });

  it("only applies to active accounts (status itself is not changed by the gate)", () => {
    for (const status of [
      MoneriumAccountStatus.Onboarding,
      MoneriumAccountStatus.Suspended,
      MoneriumAccountStatus.Closed
    ]) {
      expect(isDormancyCandidate(account({ status }), daysAgo(90), NOW)).toBe(false);
    }
  });
});
