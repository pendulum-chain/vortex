import { FiatToken, RampDirection } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { Op, UniqueConstraintError } from "sequelize";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";
import QuoteTicket from "../../../models/quoteTicket.model";

const FEE_TYPES = new Set(["absolute", "relative", "none"]);
const FIAT_CURRENCIES = new Set<string>(Object.values(FiatToken));
const NUMERIC_FIELDS = [
  "targetDiscount",
  "maxSubsidy",
  "minDynamicDifference",
  "maxDynamicDifference",
  "markupValue",
  "vortexFeeValue"
] as const;

function invalidInput(res: Response, message: string): void {
  res.status(httpStatus.BAD_REQUEST).json({
    error: {
      code: "INVALID_PRICING_CONFIG_INPUT",
      message,
      status: httpStatus.BAD_REQUEST
    }
  });
}

function serializePricingConfig(config: PartnerPricingConfig, partnerName: string) {
  return {
    createdAt: config.createdAt,
    fiatCurrency: config.fiatCurrency,
    id: config.id,
    isActive: config.isActive,
    markupCurrency: config.markupCurrency,
    markupType: config.markupType,
    markupValue: config.markupValue,
    maxDynamicDifference: config.maxDynamicDifference,
    maxSubsidy: config.maxSubsidy,
    minDynamicDifference: config.minDynamicDifference,
    partnerId: config.partnerId,
    partnerName,
    payoutAddressEvm: config.payoutAddressEvm,
    payoutAddressSubstrate: config.payoutAddressSubstrate,
    rampType: config.rampType,
    targetDiscount: config.targetDiscount,
    updatedAt: config.updatedAt,
    vortexFeeType: config.vortexFeeType,
    vortexFeeValue: config.vortexFeeValue
  };
}

export async function createPartnerPricingConfig(req: Request, res: Response): Promise<void> {
  try {
    // An empty or non-JSON POST leaves req.body undefined — validate, don't 500.
    const body = req.body ?? {};
    const { partnerName, rampType, fiatCurrency } = body;

    if (!partnerName || typeof partnerName !== "string") {
      invalidInput(res, "partnerName is a required string field");
      return;
    }

    if (rampType !== RampDirection.BUY && rampType !== RampDirection.SELL) {
      invalidInput(res, "rampType must be BUY or SELL");
      return;
    }

    if (fiatCurrency !== undefined && fiatCurrency !== null && !FIAT_CURRENCIES.has(fiatCurrency)) {
      invalidInput(
        res,
        `fiatCurrency must be one of ${[...FIAT_CURRENCIES].join(", ")} (omit or null for the all-corridors wildcard)`
      );
      return;
    }

    for (const field of NUMERIC_FIELDS) {
      const value = body[field];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
        invalidInput(res, `${field} must be a finite number`);
        return;
      }
    }
    // The discount engine only applies the cap when maxSubsidy > 0, so a negative value
    // would silently mean "uncapped", not "invalid" — reject it here.
    if (body.maxSubsidy !== undefined && body.maxSubsidy < 0) {
      invalidInput(res, "maxSubsidy must be non-negative");
      return;
    }

    const { markupType, vortexFeeType, markupCurrency, payoutAddressSubstrate, payoutAddressEvm } = body;
    if (markupType !== undefined && !FEE_TYPES.has(markupType)) {
      invalidInput(res, "markupType must be absolute, relative or none");
      return;
    }
    if (vortexFeeType !== undefined && !FEE_TYPES.has(vortexFeeType)) {
      invalidInput(res, "vortexFeeType must be absolute, relative or none");
      return;
    }
    for (const [field, value] of Object.entries({ markupCurrency, payoutAddressEvm, payoutAddressSubstrate })) {
      if (value !== undefined && value !== null && typeof value !== "string") {
        invalidInput(res, `${field} must be a string`);
        return;
      }
    }
    // Both fee components convert through markupCurrency at quote time (quote-fees.ts); an
    // active fee without one would make every matching quote fail. The value itself is not
    // enum-checked because the crypto leg resolves dynamic symbols at runtime.
    if (((markupType ?? "none") !== "none" || (vortexFeeType ?? "none") !== "none") && !markupCurrency) {
      invalidInput(res, "markupCurrency is required when markupType or vortexFeeType is not none");
      return;
    }

    const partner = await Partner.findOne({
      where: {
        isActive: true,
        name: partnerName
      }
    });

    if (!partner) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PARTNER_NOT_FOUND",
          message: `No active partners found with name: ${partnerName}`,
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // A corridor-scoped vortex row wins resolution over the wildcard, and substrate fee
    // distribution throws when the resolved vortex config lacks payout_address_substrate —
    // a scoped vortex row without addresses would brick every ramp in that corridor.
    // Inherit missing addresses from the wildcard row; refuse if none is inheritable.
    let effectivePayoutSubstrate: string | null = payoutAddressSubstrate ?? null;
    let effectivePayoutEvm: string | null = payoutAddressEvm ?? null;
    if (partner.name === "vortex" && fiatCurrency && (!effectivePayoutSubstrate || !effectivePayoutEvm)) {
      const wildcard = await PartnerPricingConfig.findOne({
        where: { fiatCurrency: null, partnerId: partner.id, rampType }
      });
      effectivePayoutSubstrate = effectivePayoutSubstrate ?? wildcard?.payoutAddressSubstrate ?? null;
      effectivePayoutEvm = effectivePayoutEvm ?? wildcard?.payoutAddressEvm ?? null;
      if (!effectivePayoutSubstrate) {
        invalidInput(
          res,
          "a corridor-scoped vortex config requires payoutAddressSubstrate (none provided and the wildcard config has none to inherit)"
        );
        return;
      }
    }

    const config = await PartnerPricingConfig.create({
      fiatCurrency: fiatCurrency ?? null,
      markupCurrency: markupCurrency ?? null,
      markupType: markupType ?? "none",
      markupValue: body.markupValue ?? 0,
      maxDynamicDifference: body.maxDynamicDifference ?? 0,
      maxSubsidy: body.maxSubsidy ?? 0,
      minDynamicDifference: body.minDynamicDifference ?? 0,
      partnerId: partner.id,
      payoutAddressEvm: effectivePayoutEvm,
      payoutAddressSubstrate: effectivePayoutSubstrate,
      rampType,
      targetDiscount: body.targetDiscount ?? 0,
      vortexFeeType: vortexFeeType ?? "none",
      vortexFeeValue: body.vortexFeeValue ?? 0
    });

    res.status(httpStatus.CREATED).json({
      pricingConfig: serializePricingConfig(config, partner.name)
    });
  } catch (error) {
    if (error instanceof UniqueConstraintError) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "PRICING_CONFIG_CONFLICT",
          message: "A pricing config already exists for this partner, ramp type and fiat-currency scope. Delete it first.",
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    logger.error("Error creating partner pricing config:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to create partner pricing config",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}

export async function deletePartnerPricingConfig(req: Request<{ configId: string }>, res: Response): Promise<void> {
  try {
    const { configId } = req.params;
    const config = await PartnerPricingConfig.findByPk(configId);

    if (!config) {
      res.status(httpStatus.NOT_FOUND).json({
        error: {
          code: "PRICING_CONFIG_NOT_FOUND",
          message: "Partner pricing config was not found",
          status: httpStatus.NOT_FOUND
        }
      });
      return;
    }

    // The security spec requires an active "vortex" config per direction: it is the
    // platform-wide fallback for fees and discounts, and deleting it breaks every quote.
    const partner = await Partner.findByPk(config.partnerId);
    if (partner?.name === "vortex" && config.fiatCurrency === null) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "VORTEX_CONFIG_PROTECTED",
          message: "The default vortex wildcard pricing config cannot be deleted.",
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    // Fee distribution re-resolves (partner, ramp_type, corridor) when the ramp's presigned
    // transactions are built at registration. Deleting a config while pending quotes still
    // reference the partner would re-route or drop their markup between quoting and
    // registration — block until those quotes are consumed or expire (quote TTL).
    const pendingQuotes = await QuoteTicket.count({
      where: {
        [Op.or]: [{ pricingPartnerId: config.partnerId }, { partnerId: config.partnerId }],
        expiresAt: { [Op.gt]: new Date() },
        rampType: config.rampType,
        status: "pending"
      }
    });
    if (pendingQuotes > 0) {
      res.status(httpStatus.CONFLICT).json({
        error: {
          code: "PRICING_CONFIG_IN_USE",
          message: `${pendingQuotes} pending quote(s) still reference this partner's pricing; retry after they expire`,
          status: httpStatus.CONFLICT
        }
      });
      return;
    }

    // Hard delete: the (partner_id, ramp_type, fiat_currency) unique index ignores
    // is_active, so a soft-deactivated row would block re-creating the same scope.
    await config.destroy();
    res.status(httpStatus.NO_CONTENT).send();
  } catch (error) {
    logger.error("Error deleting partner pricing config:", error);
    res.status(httpStatus.INTERNAL_SERVER_ERROR).json({
      error: {
        code: "INTERNAL_SERVER_ERROR",
        message: "Failed to delete partner pricing config",
        status: httpStatus.INTERNAL_SERVER_ERROR
      }
    });
  }
}
