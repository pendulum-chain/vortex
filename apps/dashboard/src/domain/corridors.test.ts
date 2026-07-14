import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { isCorridorAvailableForAccountType } from "./corridors";

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
