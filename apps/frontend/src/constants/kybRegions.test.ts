import { describe, expect, it } from "vitest";
import { availableKybRegions } from "./kybRegions";

describe("availableKybRegions", () => {
  it("offers Argentina to individuals", () => {
    expect(availableKybRegions("individual").map(region => region.code)).toContain("AR");
  });

  // Alfredpay has no AR company KYB — a business invite must not be able to pick Argentina.
  it("hides Argentina for business recipients", () => {
    const codes = availableKybRegions("business").map(region => region.code);
    expect(codes).not.toContain("AR");
    expect(codes).toContain("BR");
  });

  it("shows all enabled regions while the customer type is still undecided", () => {
    expect(availableKybRegions().map(region => region.code)).toEqual(
      availableKybRegions("individual").map(region => region.code)
    );
  });
});
