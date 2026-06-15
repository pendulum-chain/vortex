import { CreateQuoteRequest, RampDirection } from "@vortexfi/shared";
import { Op } from "sequelize";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import ProfilePartnerAssignment from "../../../../models/profilePartnerAssignment.model";
import type { PartnerPricingSource } from "./types";

type QuotePartnerResolutionRequest = CreateQuoteRequest & {
  partnerName?: string | null;
  userId?: string;
};

export interface ResolvedQuotePartner {
  ownerPartnerId: string | null;
  partner: Partner | null;
  pricingPartnerId: string | null;
  source: PartnerPricingSource;
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function findPartnerForRamp(
  partnerRef: string,
  rampType: RampDirection,
  source: PartnerPricingSource
): Promise<Partner | null> {
  const isUuid = source === "request" && UUID_PATTERN.test(partnerRef);
  const partner = await Partner.findOne({
    where: {
      ...(isUuid ? { id: partnerRef } : { name: partnerRef }),
      isActive: true,
      rampType
    }
  });

  if (!partner) {
    logger.warn(
      `Partner '${partnerRef}' from ${source} not found or not active for rampType=${rampType}. Proceeding with default fees.`
    );
  }

  return partner;
}

async function findPartnerByIdForRamp(partnerId: string, rampType: RampDirection): Promise<Partner | null> {
  const partner = await Partner.findOne({
    where: {
      id: partnerId,
      isActive: true,
      rampType
    }
  });

  if (!partner) {
    logger.warn(
      `Assigned partner '${partnerId}' not found or not active for rampType=${rampType}. Proceeding with default fees.`
    );
  }

  return partner;
}

async function findAssignedPartnerId(userId: string, rampType: RampDirection, now: Date): Promise<string | null> {
  const assignment = await ProfilePartnerAssignment.findOne({
    order: [["createdAt", "DESC"]],
    where: {
      [Op.or]: [{ expiresAt: null }, { expiresAt: { [Op.gt]: now } }],
      isActive: true,
      userId
    }
  });

  if (!assignment) {
    return null;
  }

  return rampType === RampDirection.BUY ? assignment.buyPartnerId : assignment.sellPartnerId;
}

export async function resolveQuotePartner(
  request: QuotePartnerResolutionRequest,
  now = new Date()
): Promise<ResolvedQuotePartner> {
  if (request.partnerId) {
    const partner = await findPartnerForRamp(request.partnerId, request.rampType, "request");
    return {
      ownerPartnerId: partner?.id ?? null,
      partner,
      pricingPartnerId: partner?.id ?? null,
      source: "request"
    };
  }

  if (request.partnerName) {
    const partner = await findPartnerForRamp(request.partnerName, request.rampType, "publicKey");
    return {
      ownerPartnerId: partner?.id ?? null,
      partner,
      pricingPartnerId: partner?.id ?? null,
      source: "publicKey"
    };
  }

  if (request.userId) {
    const assignedPartnerId = await findAssignedPartnerId(request.userId, request.rampType, now);
    if (assignedPartnerId) {
      const partner = await findPartnerByIdForRamp(assignedPartnerId, request.rampType);
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
