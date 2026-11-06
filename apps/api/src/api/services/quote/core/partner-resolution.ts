import { CreateQuoteRequest, QuoteError, RampCurrency, RampDirection } from "@vortexfi/shared";
import httpStatus from "http-status";
import { Op } from "sequelize";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import ProfilePartnerAssignment from "../../../../models/profilePartnerAssignment.model";
import { APIError } from "../../../errors/api-error";
import { UUID_PATTERN } from "../../../helpers/uuid";
import { findPartnerWithPricing, PartnerWithPricing } from "../../partners/partner-pricing.service";
import { getTargetFiatCurrency } from "../../phases/blocks/core/helpers";
import { isBrlPixRobinhoodRoute } from "../../phases/blocks/core/robinhood-stocks";
import type { PartnerPricingSource } from "./types";

const STOCKS_PRICING_PARTNER = "vortex-stocks";

type QuotePartnerResolutionRequest = CreateQuoteRequest & {
  controllingManagerProfileId?: string;
  userId?: string;
};

export interface ResolvedQuotePartner {
  ownerPartnerId: string | null;
  partner: PartnerWithPricing | null;
  pricingPartnerId: string | null;
  source: PartnerPricingSource;
}

async function findPartnerForRamp(
  partnerRef: string,
  rampType: RampDirection,
  fiatCurrency: RampCurrency
): Promise<PartnerWithPricing | null> {
  const isUuid = UUID_PATTERN.test(partnerRef);
  const partner = await findPartnerWithPricing(isUuid ? { id: partnerRef } : { name: partnerRef }, rampType, fiatCurrency);

  if (!partner) {
    logger.warn(
      `Partner '${partnerRef}' from request not found or not active for rampType=${rampType}. Proceeding with default fees.`
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

/** Prices from the internal row whoever calls, and fails closed rather than quoting at default fees. */
async function resolveStocksPartner(
  request: QuotePartnerResolutionRequest,
  fiatCurrency: RampCurrency
): Promise<ResolvedQuotePartner> {
  const partner = await findPartnerWithPricing({ name: STOCKS_PRICING_PARTNER }, request.rampType, fiatCurrency);
  if (!partner) {
    logger.error(`Pricing partner '${STOCKS_PRICING_PARTNER}' is missing or inactive for rampType=${request.rampType}.`);
    throw new APIError({
      isPublic: true,
      message: QuoteError.FailedToCalculateQuote,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }

  const owner = request.partnerId
    ? await Partner.findOne({
        where: {
          ...(UUID_PATTERN.test(request.partnerId) ? { id: request.partnerId } : { name: request.partnerId }),
          isActive: true
        }
      })
    : null;

  return { ownerPartnerId: owner?.id ?? null, partner, pricingPartnerId: partner.id, source: "corridor" };
}

async function findAssignment(userId: string, now: Date): Promise<{ partnerId: string | null } | null> {
  const assignment = await ProfilePartnerAssignment.findOne({
    order: [["createdAt", "DESC"]],
    where: {
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
      isActive: true,
      userId
    }
  });

  return assignment ? { partnerId: assignment.partnerId } : null;
}

export async function resolveQuotePartner(
  request: QuotePartnerResolutionRequest,
  now = new Date()
): Promise<ResolvedQuotePartner> {
  const fiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

  if (isBrlPixRobinhoodRoute(request)) {
    return resolveStocksPartner(request, fiatCurrency);
  }

  if (request.partnerId) {
    const partner = await findPartnerForRamp(request.partnerId, request.rampType, fiatCurrency);
    return {
      ownerPartnerId: partner?.id ?? null,
      partner,
      pricingPartnerId: partner?.id ?? null,
      source: "request"
    };
  }

  if (request.userId) {
    const assignment = await findAssignment(request.userId, now);
    if (assignment) {
      const partner = assignment.partnerId
        ? await findPartnerByIdForRamp(assignment.partnerId, request.rampType, fiatCurrency)
        : null;
      return {
        ownerPartnerId: null,
        partner,
        pricingPartnerId: partner?.id ?? null,
        source: partner ? "profileAssignment" : "none"
      };
    }
  }

  if (request.controllingManagerProfileId) {
    const assignment = await findAssignment(request.controllingManagerProfileId, now);
    if (assignment) {
      const partner = assignment.partnerId
        ? await findPartnerByIdForRamp(assignment.partnerId, request.rampType, fiatCurrency)
        : null;
      return {
        ownerPartnerId: null,
        partner,
        pricingPartnerId: partner?.id ?? null,
        source: partner ? "managerProfileAssignment" : "none"
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
