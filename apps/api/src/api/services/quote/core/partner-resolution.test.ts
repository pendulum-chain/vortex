import {afterEach, describe, expect, it, mock} from "bun:test";
import {EPaymentMethod, EvmToken, FiatToken, Networks, QuoteError, RampDirection} from "@vortexfi/shared";
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

  it("uses the credential partner before profile assignments", async () => {
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
      userId: "user-1"
    });

    expect(result.source).toBe("request");
    expect(result.pricingPartnerId).toBe("explicit-id");
    expect(result.ownerPartnerId).toBe("explicit-id");
    expect(assignmentLookupCount).toBe(0);
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

  it("uses the child assignment before the controlling manager assignment", async () => {
    const assignmentLookups: string[] = [];
    ProfilePartnerAssignment.findOne = mock(async ({ where }: { where: { userId: string } }) => {
      assignmentLookups.push(where.userId);
      return where.userId === "child-1" ? { partnerId: "child-partner-id" } : { partnerId: "manager-partner-id" };
    }) as unknown as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string } }) =>
      where.id === "child-partner-id" ? stubPartner("child-partner-id", "ChildPartner") : null
    ) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) =>
      where.partnerId === "child-partner-id" && where.rampType === RampDirection.BUY
        ? stubConfig("child-partner-id", RampDirection.BUY)
        : null
    ) as typeof PartnerPricingConfig.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      controllingManagerProfileId: "manager-1",
      userId: "child-1"
    });

    expect(result.source).toBe("profileAssignment");
    expect(result.pricingPartnerId).toBe("child-partner-id");
    expect(result.ownerPartnerId).toBeNull();
    expect(assignmentLookups).toEqual(["child-1"]);
  });

  it("uses the controlling manager assignment when the child has no assignment", async () => {
    const assignmentLookups: string[] = [];
    ProfilePartnerAssignment.findOne = mock(async ({ where }: { where: { userId: string } }) => {
      assignmentLookups.push(where.userId);
      return where.userId === "manager-1" ? { partnerId: "manager-partner-id" } : null;
    }) as unknown as typeof ProfilePartnerAssignment.findOne;
    Partner.findOne = mock(async ({ where }: { where: { id?: string } }) =>
      where.id === "manager-partner-id" ? stubPartner("manager-partner-id", "ManagerPartner") : null
    ) as typeof Partner.findOne;
    PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) =>
      where.partnerId === "manager-partner-id" && where.rampType === RampDirection.BUY
        ? stubConfig("manager-partner-id", RampDirection.BUY)
        : null
    ) as typeof PartnerPricingConfig.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      controllingManagerProfileId: "manager-1",
      userId: "child-1"
    });

    expect(result.source).toBe("managerProfileAssignment");
    expect(result.pricingPartnerId).toBe("manager-partner-id");
    expect(result.ownerPartnerId).toBeNull();
    expect(assignmentLookups).toEqual(["child-1", "manager-1"]);
  });

  it("does not expose manager pricing when an active child assignment is invalid", async () => {
    const assignmentLookups: string[] = [];
    ProfilePartnerAssignment.findOne = mock(async ({ where }: { where: { userId: string } }) => {
      assignmentLookups.push(where.userId);
      return where.userId === "child-1" ? { partnerId: null } : { partnerId: "manager-partner-id" };
    }) as unknown as typeof ProfilePartnerAssignment.findOne;

    const result = await resolveQuotePartner({
      ...baseRequest,
      controllingManagerProfileId: "manager-1",
      userId: "child-1"
    });

    expect(result.source).toBe("none");
    expect(result.pricingPartnerId).toBeNull();
    expect(result.ownerPartnerId).toBeNull();
    expect(assignmentLookups).toEqual(["child-1"]);
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

  describe("Robinhood Chain stock routes", () => {
    const STOCKS_ID = "stocks-id";
    const buy = { ...baseRequest, network: Networks.Robinhood, outputCurrency: EvmToken.NVDA, to: Networks.Robinhood };
    const sell = {
      from: Networks.Robinhood,
      inputAmount: "1",
      inputCurrency: EvmToken.NVDA,
      network: Networks.Robinhood,
      outputCurrency: FiatToken.BRL,
      rampType: RampDirection.SELL,
      to: EPaymentMethod.PIX
    };

    function stubStocksPartner(extra: Record<string, ReturnType<typeof stubPartner>> = {}) {
      const partners: Record<string, ReturnType<typeof stubPartner>> = {
        "vortex-stocks": stubPartner(STOCKS_ID, "vortex-stocks"),
        ...extra
      };
      Partner.findOne = mock(
        async ({ where }: { where: { name?: string } }) => partners[where.name ?? ""] ?? null
      ) as typeof Partner.findOne;
      PartnerPricingConfig.findOne = mock(async ({ where }: { where: { partnerId?: string; rampType?: RampDirection } }) =>
        where.partnerId === STOCKS_ID ? stubConfig(STOCKS_ID, where.rampType as RampDirection) : null
      ) as typeof PartnerPricingConfig.findOne;
    }

    it.each([
      ["BUY", buy],
      ["SELL", sell]
    ] as const)("prices an anonymous %s from the corridor with no owner", async (_label, request) => {
      stubStocksPartner();

      await expect(resolveQuotePartner(request)).resolves.toMatchObject({
        ownerPartnerId: null,
        pricingPartnerId: STOCKS_ID,
        source: "corridor"
      });
    });

    it("wins over profile and manager assignments, without looking them up", async () => {
      stubStocksPartner();
      const assignmentLookup = mock(async () => ({ partnerId: "assigned-id" }));
      ProfilePartnerAssignment.findOne = assignmentLookup as unknown as typeof ProfilePartnerAssignment.findOne;

      const resolved = await resolveQuotePartner({ ...buy, controllingManagerProfileId: "manager", userId: "user" });

      expect(resolved).toMatchObject({ ownerPartnerId: null, pricingPartnerId: STOCKS_ID, source: "corridor" });
      expect(assignmentLookup).not.toHaveBeenCalled();
    });

    it("keeps the caller's credential partner as owner, even with no pricing row of its own", async () => {
      stubStocksPartner({ OwnPartner: stubPartner("own-id", "OwnPartner") });

      await expect(resolveQuotePartner({ ...buy, partnerId: "OwnPartner" })).resolves.toMatchObject({
        ownerPartnerId: "own-id",
        pricingPartnerId: STOCKS_ID,
        source: "corridor"
      });
    });

    it("leaves the owner null when the credential partner does not exist", async () => {
      stubStocksPartner();

      await expect(resolveQuotePartner({ ...buy, partnerId: "GonePartner" })).resolves.toMatchObject({
        ownerPartnerId: null,
        pricingPartnerId: STOCKS_ID,
        source: "corridor"
      });
    });

    it("fails closed when the row is missing, even for a caller with its own partner", async () => {
      Partner.findOne = mock(async ({ where }: { where: { name?: string } }) =>
        where.name === "OwnPartner" ? stubPartner("own-id", "OwnPartner") : null
      ) as typeof Partner.findOne;
      PartnerPricingConfig.findOne = mock(async () => stubConfig("own-id", RampDirection.BUY)) as typeof PartnerPricingConfig.findOne;

      for (const request of [buy, sell, { ...buy, partnerId: "OwnPartner" }]) {
        await expect(resolveQuotePartner(request)).rejects.toMatchObject({
          isPublic: true,
          message: QuoteError.FailedToCalculateQuote,
          status: 500
        });
      }
    });

    it.each([
      ["a non-BRL BUY", { ...buy, from: EPaymentMethod.SPEI, inputCurrency: FiatToken.MXN }],
      ["a non-Pix BUY", { ...buy, from: EPaymentMethod.SEPA }],
      ["a non-BRL SELL", { ...sell, outputCurrency: FiatToken.MXN, to: EPaymentMethod.SPEI }],
      ["a non-Pix SELL", { ...sell, to: EPaymentMethod.SEPA }]
    ])("does not touch %s, so the catalog can reject it", async (_label, request) => {
      Partner.findOne = mock(async () => null) as typeof Partner.findOne;

      await expect(resolveQuotePartner(request)).resolves.toMatchObject({ partner: null, source: "none" });
    });

    it("does not touch other networks", async () => {
      Partner.findOne = mock(async () => null) as typeof Partner.findOne;

      await expect(resolveQuotePartner(baseRequest)).resolves.toMatchObject({ partner: null, source: "none" });
    });
  });
});
