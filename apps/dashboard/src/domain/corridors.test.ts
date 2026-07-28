import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { CORRIDORS, isCorridorAvailableForAccountType, isCorridorOnboardingDisabled } from "./corridors";

describe("isCorridorAvailableForAccountType", () => {
  it("disallows Argentina for company accounts", () => {
    assert.equal(isCorridorAvailableForAccountType("AR", "company"), false);
  });

  it("keeps Argentina individual and Alfredpay MX/CO/US company onboarding available", () => {
    assert.equal(isCorridorAvailableForAccountType("AR", "individual"), true);
    assert.equal(isCorridorAvailableForAccountType("MX", "company"), true);
    assert.equal(isCorridorAvailableForAccountType("CO", "company"), true);
    assert.equal(isCorridorAvailableForAccountType("US", "company"), true);
  });
});

describe("isCorridorOnboardingDisabled", () => {
  it("disables EU onboarding only, leaving every other corridor untouched", () => {
    assert.equal(isCorridorOnboardingDisabled(CORRIDORS.EU), true);
    for (const corridor of [CORRIDORS.AR, CORRIDORS.BR, CORRIDORS.CO, CORRIDORS.MX, CORRIDORS.US]) {
      assert.equal(isCorridorOnboardingDisabled(corridor), false);
    }
  });
});
