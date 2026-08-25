import { beforeAll, beforeEach, describe, expect, it } from "bun:test";
import ProfilePartnerAssignment from "../../../models/profilePartnerAssignment.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestPartner, createTestUser } from "../../../test-utils/factories";
import { claimPartnerAttribution } from "./partner-attribution.service";

describe("partner attribution", () => {
  beforeAll(setupTestDatabase);
  beforeEach(resetTestDatabase);

  it("creates an active assignment carrying the partner's id and name", async () => {
    const user = await createTestUser();
    const partner = await createTestPartner();

    expect(await claimPartnerAttribution(user.id, partner.id)).toBe("created");

    const assignments = await ProfilePartnerAssignment.findAll({ where: { userId: user.id } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0]).toMatchObject({
      expiresAt: null,
      isActive: true,
      partnerId: partner.id,
      partnerName: partner.name
    });
  });

  it("never replaces an existing active assignment (first partner wins)", async () => {
    const user = await createTestUser();
    const firstPartner = await createTestPartner();
    const secondPartner = await createTestPartner();
    await ProfilePartnerAssignment.create({
      isActive: true,
      partnerId: firstPartner.id,
      partnerName: firstPartner.name,
      userId: user.id
    });

    expect(await claimPartnerAttribution(user.id, secondPartner.id)).toBe("skipped_existing_assignment");

    const assignments = await ProfilePartnerAssignment.findAll({ where: { isActive: true, userId: user.id } });
    expect(assignments).toHaveLength(1);
    expect(assignments[0].partnerId).toBe(firstPartner.id);
  });

  it("is idempotent for repeated claims of the same partner", async () => {
    const user = await createTestUser();
    const partner = await createTestPartner();

    expect(await claimPartnerAttribution(user.id, partner.id)).toBe("created");
    expect(await claimPartnerAttribution(user.id, partner.id)).toBe("skipped_existing_assignment");
    expect(await ProfilePartnerAssignment.count({ where: { userId: user.id } })).toBe(1);
  });

  it("replaces an expired active row without tripping the active-assignment unique index", async () => {
    const user = await createTestUser();
    const expiredPartner = await createTestPartner();
    const partner = await createTestPartner();
    await ProfilePartnerAssignment.create({
      expiresAt: new Date(Date.now() - 60_000),
      isActive: true,
      partnerId: expiredPartner.id,
      partnerName: expiredPartner.name,
      userId: user.id
    });

    expect(await claimPartnerAttribution(user.id, partner.id)).toBe("created");

    const active = await ProfilePartnerAssignment.findAll({ where: { isActive: true, userId: user.id } });
    expect(active).toHaveLength(1);
    expect(active[0].partnerId).toBe(partner.id);
  });

  it("skips inactive partners and missing profiles without creating rows", async () => {
    const user = await createTestUser();
    const inactivePartner = await createTestPartner({ isActive: false });
    const partner = await createTestPartner();

    expect(await claimPartnerAttribution(user.id, inactivePartner.id)).toBe("skipped_partner_inactive");
    expect(await claimPartnerAttribution(crypto.randomUUID(), partner.id)).toBe("skipped_profile_missing");
    expect(await ProfilePartnerAssignment.count()).toBe(0);
  });
});
