import { describe, expect, it } from "bun:test";
import { AlfredPayStatus, MykoboCustomerStatus } from "@vortexfi/shared";
import { AveniaKycStatus } from "../../../models/providerCustomer.model";
import { isProviderApproved, isProviderInReview, isProviderRestricted } from "./transfer-eligibility.service";

// Mirrors providerState() in onboarding.controller.ts: the same precedence the dashboard
// rollup relies on (approved > rejected > in_review > pending).
function classify(status: string): "approved" | "rejected" | "in_review" | "pending" {
  if (isProviderApproved(status)) return "approved";
  if (isProviderRestricted(status)) return "rejected";
  if (isProviderInReview(status)) return "in_review";
  return "pending";
}

describe("provider status classification", () => {
  it("classifies terminal approved statuses", () => {
    expect(classify(MykoboCustomerStatus.APPROVED)).toBe("approved");
    expect(classify(AlfredPayStatus.Success)).toBe("approved");
    expect(classify(AveniaKycStatus.Accepted)).toBe("approved");
  });

  it("classifies terminal rejected statuses", () => {
    expect(classify(MykoboCustomerStatus.REJECTED)).toBe("rejected");
    expect(classify(AlfredPayStatus.Failed)).toBe("rejected");
    expect(classify(AveniaKycStatus.Rejected)).toBe("rejected");
  });

  it("classifies submitted-and-under-review statuses as in_review", () => {
    expect(classify(MykoboCustomerStatus.PENDING)).toBe("in_review");
    expect(classify(AlfredPayStatus.UserCompleted)).toBe("in_review");
    expect(classify(AlfredPayStatus.Verifying)).toBe("in_review");
    expect(classify(AveniaKycStatus.Requested)).toBe("in_review");
  });

  it("keeps awaiting-customer statuses as pending", () => {
    expect(classify(MykoboCustomerStatus.CONSULTED)).toBe("pending");
    expect(classify(AlfredPayStatus.Consulted)).toBe("pending");
    expect(classify(AlfredPayStatus.LinkOpened)).toBe("pending");
    expect(classify(AlfredPayStatus.UpdateRequired)).toBe("pending");
    expect(classify(AveniaKycStatus.Consulted)).toBe("pending");
  });

  it("does not classify in-review statuses as approved or restricted (gate is unchanged)", () => {
    for (const status of [MykoboCustomerStatus.PENDING, AlfredPayStatus.Verifying, AveniaKycStatus.Requested]) {
      expect(isProviderApproved(status)).toBe(false);
      expect(isProviderRestricted(status)).toBe(false);
    }
  });
});
