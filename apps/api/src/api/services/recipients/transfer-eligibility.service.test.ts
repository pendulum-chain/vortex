import { describe, expect, it } from "bun:test";
import { VerificationStatus } from "../../../models/providerCustomer.model";
import {
  isFreshMoneriumApproval,
  isProviderApproved,
  isProviderInReview,
  isProviderRestricted,
  providerForRail
} from "./transfer-eligibility.service";

function classify(status: string): "approved" | "rejected" | "in_review" | "started" | "pending" {
  if (isProviderApproved(status)) return "approved";
  if (isProviderRestricted(status)) return "rejected";
  if (isProviderInReview(status)) return "in_review";
  if (status === VerificationStatus.Started) return "started";
  return "pending";
}

describe("provider status classification", () => {
  it("uses Monerium as the EUR onboarding provider", () => {
    expect(providerForRail("eur")).toBe("monerium");
  });

  it("fails closed when a mirrored Monerium approval is stale", () => {
    const now = Date.UTC(2026, 6, 13, 12, 0, 0);
    expect(isFreshMoneriumApproval(new Date(now - 4 * 60 * 1000), now)).toBe(true);
    expect(isFreshMoneriumApproval(new Date(now - 6 * 60 * 1000), now)).toBe(false);
  });

  it("classifies terminal approved statuses", () => {
    expect(classify(VerificationStatus.Approved)).toBe("approved");
  });

  it("classifies terminal rejected statuses", () => {
    expect(classify(VerificationStatus.Rejected)).toBe("rejected");
  });

  it("classifies submitted-and-under-review statuses as in_review", () => {
    expect(classify(VerificationStatus.InReview)).toBe("in_review");
  });

  it("distinguishes an initiated flow from missing or stale data", () => {
    expect(classify(VerificationStatus.Started)).toBe("started");
    expect(classify(VerificationStatus.Pending)).toBe("pending");
  });

  it("does not classify in-review statuses as approved or restricted (gate is unchanged)", () => {
    for (const status of [VerificationStatus.InReview]) {
      expect(isProviderApproved(status)).toBe(false);
      expect(isProviderRestricted(status)).toBe(false);
    }
  });
});
