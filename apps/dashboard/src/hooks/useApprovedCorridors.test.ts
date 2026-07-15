import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OnboardingStatusResponse } from "@/services/api/onboarding.service";
import { approvedCorridorsFrom } from "./useApprovedCorridors";

function account(country: string, state: "approved" | "pending") {
  return {
    companyName: null,
    country,
    customerType: "individual",
    error: null,
    id: `account-${country}`,
    kycCase: null,
    provider: "alfredpay",
    rail: null,
    state,
    status: state,
    statusExternal: null,
    taxReference: null
  };
}

describe("approvedCorridorsFrom", () => {
  it("uses only approvals belonging to the active legal entity", () => {
    const data: OnboardingStatusResponse = {
      activeEntityId: "active-business",
      entities: [
        { accounts: [account("MX", "approved")], id: "inactive-individual", status: "active", type: "individual" },
        { accounts: [account("CO", "pending")], id: "active-business", status: "active", type: "business" }
      ],
      selectionRequired: false
    };

    assert.deepEqual([...approvedCorridorsFrom(data)], []);
  });
});
