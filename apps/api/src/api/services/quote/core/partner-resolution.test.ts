import {afterEach, describe, expect, it, mock} from "bun:test";
import {EPaymentMethod, EvmToken, FiatToken, Networks, RampDirection} from "@vortexfi/shared";
import Partner from "../../../../models/partner.model";
import PartnerPricingConfig from "../../../../models/partnerPricingConfig.model";
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

function stubPartner(id: string, name: string) {
  return { displayName: name, id, isActive: true, logoUrl: null, name };
}

function stubConfig(partnerId: string, rampType: RampDirection) {
  return {
    isActive: true,
    markupCurrency: FiatToken.EURC,
    markupType: "none",
    markupValue: 0,
    maxDynamicDifference: 0,
    maxSubsidy: 0,
    minDynamicDifference: 0,
    partnerId,
    payoutAddressEvm: null,
    payoutAddressSubstrate: null,
    rampType,
    targetDiscount: 0,
    vortexFeeType: "none",
    vortexFeeValue: 0
  };
}

describe("resolveQuotePartner", () => {
  const originalPartnerFindOne = Partner.findOne;
  const originalConfigFindOne = PartnerPricingConfig.findOne;
  const originalAssignmentFindOne = ProfilePartnerAssignment.findOne;

  afterEach(() => {
    Partner.findOne = originalPartnerFindOne;
    PartnerPricingConfig.findOne = originalConfigFindOne;
    ProfilePartnerAssignment.findOne = originalAssignmentFindOne;
  });

  it("uses explicit partnerId before public keys or profile assignments", async () => {
    let assignmentLookupCount = 0;
    Partner.findOne = mock(async ({ where }: { where: { name?: string } }) => {
      if (where.name === "ExplicitPartner") {
        return stubPartner("explicit-id", "ExplicitPartner");
      }
      return null;
    }) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) => {
      if (where.partnerId === "explicit-id" && where.rampType === RampDirection.BUY) {
        return stubConfig("explicit-id", RampDirection.BUY);
      }
      return null;
    }) as typeof PartnerPricingConfig.findOne;
    ProfilePartnerAssignment.findOne = mock(async () => {
      assignmentLookupCount++;
      return { partnerId: "assigned-id" };
    }) as typeof ProfilePartnerAssignment.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      partnerId: "ExplicitPartner",
      partnerName: "PublicKeyPartner",
      userId: "user-1"
    });

    expect(result.source).toBe("request");
    expect(result.pricingPartnerId).toBe("explicit-id");
    expect(result.ownerPartnerId).toBe("explicit-id");
    expect(assignmentLookupCount).toBe(0);
  });

  it("keeps public-key partner quotes partner-owned for compatibility", async () => {
    Partner.findOne = mock(async ({ where }: { where: { name?: string } }) => {
      if (where.name === "PublicKeyPartner") {
        return stubPartner("public-key-id", "PublicKeyPartner");
      }
      return null;
    }) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async () =>
      stubConfig("public-key-id", RampDirection.BUY)
    ) as typeof PartnerPricingConfig.findOne;
    ProfilePartnerAssignment.findOne = mock(async () => ({
      partnerId: "assigned-id"
    })) as typeof ProfilePartnerAssignment.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      partnerName: "PublicKeyPartner",
      userId: "user-1"
    });

    expect(result.source).toBe("publicKey");
    expect(result.pricingPartnerId).toBe("public-key-id");
    expect(result.ownerPartnerId).toBe("public-key-id");
  });

  it("applies the profile assignment as pricing-only for authenticated buy users", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      partnerId: "assigned-id"
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string } }) => {
      if (where.id === "assigned-id") {
        return stubPartner("assigned-id", "AssignedPartner");
      }
      return null;
    }) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) => {
      if (where.partnerId === "assigned-id" && where.rampType === RampDirection.BUY) {
        return stubConfig("assigned-id", RampDirection.BUY);
      }
      return null;
    }) as typeof PartnerPricingConfig.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      userId: "user-1"
    });

    expect(result.source).toBe("profileAssignment");
    expect(result.pricingPartnerId).toBe("assigned-id");
    expect(result.ownerPartnerId).toBeNull();
  });

  it("resolves the sell-direction pricing config for sell users", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      partnerId: "assigned-id"
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string } }) => {
      if (where.id === "assigned-id") {
        return stubPartner("assigned-id", "AssignedPartner");
      }
      return null;
    }) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) => {
      if (where.partnerId === "assigned-id" && where.rampType === RampDirection.SELL) {
        return stubConfig("assigned-id", RampDirection.SELL);
      }
      return null;
    }) as typeof PartnerPricingConfig.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      rampType: RampDirection.SELL,
      userId: "user-1"
    });

    expect(result.source).toBe("profileAssignment");
    expect(result.pricingPartnerId).toBe("assigned-id");
    expect(result.ownerPartnerId).toBeNull();
    expect(result.partner?.rampType).toBe(RampDirection.SELL);
  });

  it("falls back to default pricing when the assignment has no partner id", async () => {
    ProfilePartnerAssignment.findOne = mock(async () => ({
      partnerId: null
    })) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async () => stubPartner("unexpected", "unexpected")) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async () => null) as typeof PartnerPricingConfig.findOne;

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
      return { partnerId: "assigned-id" };
    }) as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async () => null) as typeof Partner.findOne;

    const result = await resolveQuotePartner(baseRequest);

    expect(result.source).toBe("none");
    expect(result.pricingPartnerId).toBeNull();
    expect(result.ownerPartnerId).toBeNull();
    expect(assignmentLookupCount).toBe(0);
  });
});
