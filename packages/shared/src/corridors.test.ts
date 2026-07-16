import { describe, expect, test } from "bun:test";
import { CORRIDOR_CAPABILITIES, isCorridorSupportedForCustomerType } from "./corridors";

describe("isCorridorSupportedForCustomerType", () => {
  test("AR supports individuals only (Alfredpay has no AR company KYB)", () => {
    expect(isCorridorSupportedForCustomerType("AR", "individual")).toBe(true);
    expect(isCorridorSupportedForCustomerType("AR", "business")).toBe(false);
  });

  test("every other corridor supports both customer types", () => {
    const others = (Object.keys(CORRIDOR_CAPABILITIES) as (keyof typeof CORRIDOR_CAPABILITIES)[]).filter(c => c !== "AR");
    for (const country of others) {
      expect(isCorridorSupportedForCustomerType(country, "individual")).toBe(true);
      expect(isCorridorSupportedForCustomerType(country, "business")).toBe(true);
    }
  });
});
