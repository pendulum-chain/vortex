import { CreateQuoteRequest, RampCurrency, RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../../../config/logger";
import ProfilePartnerAssignment from "../../../../models/profilePartnerAssignment.model";
import { findPartnerWithPricing, PartnerWithPricing } from "../../partners/partner-pricing.service";
import { getTargetFiatCurrency } from "./helpers";
import type { PartnerPricingSource } from "./types";

type QuotePartnerResolutionRequest = CreateQuoteRequest & {
  partnerName?: string | null;
  userId?: string;
};

export interface ResolvedQuotePartner {
  ownerPartnerId: string | null;
  partner: PartnerWithPricing | null;
  pricingPartnerId: string | null;
  source: PartnerPricingSource;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findPartnerForRamp(
  partnerRef: string,
  rampType: RampDirection,
  fiatCurrency: RampCurrency,
  source: PartnerPricingSource
): Promise<PartnerWithPricing | null> {
  const isUuid = source === "request" && UUID_PATTERN.test(partnerRef);
  const partner = await findPartnerWithPricing(isUuid ? { id: partnerRef } : { name: partnerRef }, rampType, fiatCurrency);

  if (!partner) {
    logger.warn(
      `Partner '${partnerRef}' from ${source} not found or not active for rampType=${rampType}. Proceeding with default fees.`
    );
  }

  return partner;
}

async function findPartnerByIdForRamp(
  partnerId: string,
  rampType: RampDirection,
  fiatCurrency: RampCurrency
): Promise<PartnerWithPricing | null> {
  const partner = await findPartnerWithPricing({ id: partnerId }, rampType, fiatCurrency);

  if (!partner) {
    logger.warn(
      `Assigned partner '${partnerId}' not found or not active for rampType=${rampType}. Proceeding with default fees.`
    );
  }

  return partner;
}

async function findAssignedPartnerId(userId: string, now: Date): Promise<string | null> {
  const assignment = await ProfilePartnerAssignment.findOne({
    order: [["createdAt", "DESC"]],
    where: {
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
      isActive: true,
      userId
    }
  });

  return assignment?.partnerId ?? null;
}

export async function resolveQuotePartner(
  request: QuotePartnerResolutionRequest,
  now = new Date()
): Promise<ResolvedQuotePartner> {
  const fiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

  if (request.partnerId) {
    const partner = await findPartnerForRamp(request.partnerId, request.rampType, fiatCurrency, "request");
    return {
      ownerPartnerId: partner?.id ?? null,
      partner,
      pricingPartnerId: partner?.id ?? null,
      source: "request"
    };
  }

  if (request.partnerName) {
    const partner = await findPartnerForRamp(request.partnerName, request.rampType, fiatCurrency, "publicKey");
    return {
      ownerPartnerId: partner?.id ?? null,
      partner,
      pricingPartnerId: partner?.id ?? null,
      source: "publicKey"
    };
  }

  if (request.userId) {
    const assignedPartnerId = await findAssignedPartnerId(request.userId, now);
    if (assignedPartnerId) {
      const partner = await findPartnerByIdForRamp(assignedPartnerId, request.rampType, fiatCurrency);
      return {
        ownerPartnerId: null,
        partner,
        pricingPartnerId: partner?.id ?? null,
        source: "profileAssignment"
      };
    }
  }

  return {
    ownerPartnerId: null,
    partner: null,
    pricingPartnerId: null,
    source: "none"
  };
}
