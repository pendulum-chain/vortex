import assert from "node:assert/strict";
import { describe, it } from "node:test";
import type { OnboardingAccountDto, OnboardingEntityDto } from "./onboarding.service";
import { deriveOnboardings } from "./onboarding.mappers";

const ramp = { chain: "polygon", iban: "provisioned" as const, linkedAddress: "0xabc", source: "oauth" as const };

function account(provider: "monerium" | "mykobo", extra: Partial<OnboardingAccountDto> = {}): OnboardingAccountDto {
  return {
    companyName: null,
    country: null,
    customerType: "individual",
    error: null,
    id: `account-${provider}`,
    kycCase: null,
    provider,
    rail: "eur",
    ramp: null,
    state: "approved",
    status: "approved",
    statusExternal: "approved",
    taxReference: null,
    ...extra
  };
}

function entity(accounts: OnboardingAccountDto[]): OnboardingEntityDto {
  return { accounts, id: "entity-1", status: "active", type: "individual" };
}

describe("deriveOnboardings", () => {
  it("lets an approved Monerium row win over a legacy approved Mykobo row regardless of order", () => {
    for (const accounts of [
      [account("mykobo"), account("monerium", { ramp })],
      [account("monerium", { ramp }), account("mykobo")]
    ]) {
      const eu = deriveOnboardings(entity(accounts), "individual").EU;
      assert.equal(eu?.status, "approved");
      assert.deepEqual(eu?.ramp, ramp);
    }
  });

  it("still surfaces the furthest-along row when the providers differ in status", () => {
    const eu = deriveOnboardings(entity([account("mykobo"), account("monerium", { state: "pending", status: "pending" })]), "individual")
      .EU;
    assert.equal(eu?.status, "approved");
  });
});
