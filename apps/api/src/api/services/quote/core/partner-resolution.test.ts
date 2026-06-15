import {afterEach, describe, expect, it, mock} from "bun:test";
import {EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import Partner from "../../../../models/partner.model";
import ProfilePartnerAssignment from "../../../../models/profilePartnerAssignment.model";
import {resolveQuotePartner} from "./partner-resolution";

const baseRequest = {
  from: EPaymentMethod.PIX,
  inputAmount: "100",
  inputCurrency: FiatToken.BRL,
  network: Networks.Base,
  outputCurrency: EvmToken.USDC,
  rampType: RampDirection.BUY,
  to: Networks.Base
};

describe("resolveQuotePartner", () => {
  const originalPartnerFindOne = Partner.findOne;
  const originalAssignmentFindOne = ProfilePartnerAssignment.findOne;

  afterEach(() => {
    Partner.findOne = originalPartnerFindOne;
    ProfilePartnerAssignment.findOne = originalAssignmentFindOne;
  });

  it("uses explicit partnerId before public keys or profile assignments", async () => {
    let assignmentLookupCount = 0;
    Partner.findOne = mock(async ({ where }: { where: { name?: string } }) => {
      if (where.name === "ExplicitPartner") {
        return { id: "explicit-buy-id", name: "ExplicitPartner" };
      }
      return null;
    }) as typeof Partner.findOne;
    ProfilePartnerAssignment.findOne = mock(async () => {
      assignmentLookupCount++;
      return { buyPartnerId: "assigned-buy-id", sellPartnerId: "assigned-sell-id" };
    }) as typeof ProfilePartnerAssignment.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      partnerId: "ExplicitPartner",
      partnerName: "PublicKeyPartner",
      userId: "user-1"
    });

    expect(result.source).toBe("request");
    expect(result.pricingPartnerId).toBe("explicit-buy-id");
    expect(result.ownerPartnerId).toBe("explicit-buy-id");
    expect(assignmentLookupCount).toBe(0);
  });

  it("keeps public-key partner quotes partner-owned for compatibility", async () => {
    Partner.findOne = mock(async ({ where }: { where: { name?: string } }) => {
      if (where.name === "PublicKeyPartner") {
        return { id: "public-key-buy-id", name: "PublicKeyPartner" };
      }
      return null;
    }) as typeof Partner.findOne;
    ProfilePartnerAssignment.findOne = mock(async () => ({
      buyPartnerId: "assigned-buy-id",
      sellPartnerId: "assigned-sell-id"
    })) as typeof ProfilePartnerAssignment.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      partnerName: "PublicKeyPartner",
      userId: "user-1"
    });

    expect(result.source).toBe("publicKey");
    expect(result.pricingPartnerId).toBe("public-key-buy-id");
    expect(result.ownerPartnerId).toBe("public-key-buy-id");
  });

  it("applies the buy profile assignment as pricing-only for authenticated buy users", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      buyPartnerId: "assigned-buy-id",
      sellPartnerId: "assigned-sell-id"
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string; rampType?: RampDirection } }) => {
      if (where.id === "assigned-buy-id" && where.rampType === RampDirection.BUY) {
        return { id: "assigned-buy-id", name: "AssignedPartner" };
      }
      return null;
    }) as typeof Partner.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      userId: "user-1"
    });

    expect(result.source).toBe("profileAssignment");
    expect(result.pricingPartnerId).toBe("assigned-buy-id");
    expect(result.ownerPartnerId).toBeNull();
  });

  it("applies the sell profile assignment as pricing-only for authenticated sell users", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      buyPartnerId: "assigned-buy-id",
      sellPartnerId: "assigned-sell-id"
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string; rampType?: RampDirection } }) => {
      if (where.id === "assigned-sell-id" && where.rampType === RampDirection.SELL) {
        return { id: "assigned-sell-id", name: "AssignedPartner" };
      }
      return null;
    }) as typeof Partner.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      rampType: RampDirection.SELL,
      userId: "user-1"
    });

    expect(result.source).toBe("profileAssignment");
    expect(result.pricingPartnerId).toBe("assigned-sell-id");
    expect(result.ownerPartnerId).toBeNull();
  });

  it("falls back to default pricing when no partner id is assigned for the ramp type", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      buyPartnerId: null,
      sellPartnerId: "assigned-sell-id"
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async () => ({ id: "unexpected" })) as typeof Partner.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      userId: "user-1"
    });

    expect(result.source).toBe("none");
    expect(result.pricingPartnerId).toBeNull();
    expect(result.ownerPartnerId).toBeNull();
  });

  it("does not apply profile assignments to anonymous requests", async () => {
    let assignmentLookupCount = 0;
    ProfilePartnerAssignment.findOne = mock(async () => {
      assignmentLookupCount++;
      return { buyPartnerId: "assigned-buy-id", sellPartnerId: "assigned-sell-id" };
    }) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async () => null) as typeof Partner.findOne;

    const result = await resolveQuotePartner(baseRequest);

    expect(result.source).toBe("none");
    expect(result.pricingPartnerId).toBeNull();
    expect(result.ownerPartnerId).toBeNull();
    expect(assignmentLookupCount).toBe(0);
  });
});
