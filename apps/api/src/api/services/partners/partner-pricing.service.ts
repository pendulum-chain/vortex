import { RampCurrency, RampDirection } from "@vortexfi/shared";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";

/**
 * A partner's identity merged with its pricing config for one ramp direction — the same
 * shape the pre-split partners row exposed, so pricing call sites stay unchanged.
 */
export interface PartnerWithPricing {
  id: string;
  name: string;
  displayName: string;
  logoUrl: string | null;
  rampType: RampDirection;
  markupType: "absolute" | "relative" | "none";
  markupValue: number;
  markupCurrency: RampCurrency;
  vortexFeeType: "absolute" | "relative" | "none";
  vortexFeeValue: number;
  targetDiscount: number;
  maxSubsidy: number;
  minDynamicDifference: number;
  maxDynamicDifference: number;
  payoutAddressSubstrate: string | null;
  payoutAddressEvm: string | null;
}

/**
 * Resolves an active partner (by id or unique name) together with its active pricing
 * config for the given direction. Returns null when either the partner or the
 * direction's config is missing/inactive — the exact semantics of the pre-split
 * `Partner.findOne({ name|id, isActive, rampType })`.
 */
export async function findPartnerWithPricing(
  ref: { id?: string; name?: string },
  rampType: RampDirection
): Promise<PartnerWithPricing | null> {
  const partner = await Partner.findOne({
    where: {
      ...(ref.id ? { id: ref.id } : { name: ref.name }),
      isActive: true
    }
  });
  if (!partner) {
    return null;
  }

  const config = await PartnerPricingConfig.findOne({
    where: {
      isActive: true,
      partnerId: partner.id,
      rampType
    }
  });
  if (!config) {
    return null;
  }

  return {
    displayName: partner.displayName,
    id: partner.id,
    logoUrl: partner.logoUrl,
    // Nullable in the DB but only read when markupType !== "none" (same contract the
    // pre-split partners row had).
    markupCurrency: config.markupCurrency as RampCurrency,
    markupType: config.markupType,
    markupValue: config.markupValue,
    maxDynamicDifference: config.maxDynamicDifference,
    maxSubsidy: config.maxSubsidy,
    minDynamicDifference: config.minDynamicDifference,
    name: partner.name,
    payoutAddressEvm: config.payoutAddressEvm,
    payoutAddressSubstrate: config.payoutAddressSubstrate,
    rampType,
    targetDiscount: config.targetDiscount,
    vortexFeeType: config.vortexFeeType,
    vortexFeeValue: config.vortexFeeValue
  };
}
