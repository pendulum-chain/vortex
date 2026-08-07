import { describe, expect, it } from "bun:test";
import models from "./index";

describe("ProfilePartnerAssignment model", () => {
  it("does not register the legacy buy and sell partner columns or associations", () => {
    const attributes = models.ProfilePartnerAssignment.getAttributes();

    expect(attributes).not.toHaveProperty("buyPartnerId");
    expect(attributes).not.toHaveProperty("sellPartnerId");
    expect(Object.values(attributes).map(attribute => attribute.field)).not.toContain("buy_partner_id");
    expect(Object.values(attributes).map(attribute => attribute.field)).not.toContain("sell_partner_id");
    expect(models.ProfilePartnerAssignment.associations).not.toHaveProperty("buyPartner");
    expect(models.ProfilePartnerAssignment.associations).not.toHaveProperty("sellPartner");
    expect(models.Partner.associations).not.toHaveProperty("buyProfileAssignments");
    expect(models.Partner.associations).not.toHaveProperty("sellProfileAssignments");
  });
});
