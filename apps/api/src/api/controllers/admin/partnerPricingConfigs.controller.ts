import { FiatToken, RampDirection } from "@vortexfi/shared";
import { Request, Response } from "express";
import httpStatus from "http-status";
import { UniqueConstraintError } from "sequelize";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import PartnerPricingConfig from "../../../models/partnerPricingConfig.model";

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
    const { partnerName, rampType, fiatCurrency } = req.body;

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
      const value = req.body[field];
      if (value !== undefined && (typeof value !== "number" || !Number.isFinite(value))) {
        invalidInput(res, `${field} must be a finite number`);
        return;
      }
    }

    const { markupType, vortexFeeType, markupCurrency, payoutAddressSubstrate, payoutAddressEvm } = req.body;
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

    const config = await PartnerPricingConfig.create({
      fiatCurrency: fiatCurrency ?? null,
      markupCurrency: markupCurrency ?? null,
      markupType: markupType ?? "none",
      markupValue: req.body.markupValue ?? 0,
      maxDynamicDifference: req.body.maxDynamicDifference ?? 0,
      maxSubsidy: req.body.maxSubsidy ?? 0,
      minDynamicDifference: req.body.minDynamicDifference ?? 0,
      partnerId: partner.id,
      payoutAddressEvm: payoutAddressEvm ?? null,
      payoutAddressSubstrate: payoutAddressSubstrate ?? null,
      rampType,
      targetDiscount: req.body.targetDiscount ?? 0,
      vortexFeeType: vortexFeeType ?? "none",
      vortexFeeValue: req.body.vortexFeeValue ?? 0
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
