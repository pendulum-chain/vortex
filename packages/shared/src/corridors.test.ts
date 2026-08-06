import { describe, expect, test } from "bun:test";
import { CORRIDOR_CAPABILITIES, CORRIDOR_FIAT_TOKEN, FIAT_TOKEN_CORRIDOR, isCorridorSupportedForCustomerType } from "./corridors";
import { FiatToken } from "./tokens/types/base";

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

describe("corridor fiat tokens", () => {
  test("maps every corridor to its fiat token and back", () => {
    expect(CORRIDOR_FIAT_TOKEN).toEqual({
      AR: FiatToken.ARS,
      BR: FiatToken.BRL,
      CO: FiatToken.COP,
      EU: FiatToken.EURC,
      MX: FiatToken.MXN,
      US: FiatToken.USD
    });
    for (const [corridor, fiatToken] of Object.entries(CORRIDOR_FIAT_TOKEN)) {
      expect(FIAT_TOKEN_CORRIDOR[fiatToken]).toBe(corridor);
    }
  });
});
