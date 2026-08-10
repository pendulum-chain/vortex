import { describe, expect, it } from "bun:test";
import { getManagedProfileCountryCorridor, getManagedProfileLimitsCorridors } from "./managedProfileCorridor";

describe("getManagedProfileCountryCorridor", () => {
  it("accepts corridors served by Alfredpay", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "MX" }, query: {} } as never)).toBe("MX");
  });

  it("rejects supported countries served by another provider", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "BR" }, query: {} } as never)).toBeUndefined();
  });
});

describe("getManagedProfileLimitsCorridors", () => {
  it("returns every requested limits corridor", () => {
    expect(getManagedProfileLimitsCorridors({ body: { corridors: ["BR", "MX"] } } as never)).toEqual(["BR", "MX"]);
  });

  it("rejects empty or unsupported corridor input", () => {
    expect(getManagedProfileLimitsCorridors({ body: { corridors: [] } } as never)).toBeUndefined();
    expect(getManagedProfileLimitsCorridors({ body: { corridors: ["EU"] } } as never)).toBeUndefined();
  });
});
