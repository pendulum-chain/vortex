import { describe, expect, it } from "bun:test";
import { getManagedProfileCountryCorridor } from "./managedProfileCorridor";

describe("getManagedProfileCountryCorridor", () => {
  it("accepts corridors served by Alfredpay", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "MX" }, query: {} } as never)).toBe("MX");
  });

  it("rejects supported countries served by another provider", () => {
    expect(getManagedProfileCountryCorridor({ body: { country: "BR" }, query: {} } as never)).toBeUndefined();
  });
});
