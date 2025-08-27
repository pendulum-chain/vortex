import { DestinationType, QuoteError, RampCurrency, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import Anchor from "../../../../models/anchor.model";
import Partner from "../../../../models/partner.model";
import { APIError } from "../../../errors/api-error";
import { priceFeedService } from "../../priceFeed.service";
import { getTargetFiatCurrency, validateChainSupport } from "./helpers";

export interface CalculateFeeComponentsRequest {
  inputAmount: string;
  outputAmountOfframp: string; // This is only needed for offramp quotes
  rampType: RampDirection;
  from: DestinationType;
  to: DestinationType;
  partnerName?: string;
  inputCurrency: RampCurrency;
  outputCurrency: RampCurrency;
}

export interface FeeComponentsResult {
  vortexFee: string;
  anchorFee: string;
  partnerMarkupFee: string;
  feeCurrency: RampCurrency;
}

export interface PreNablaDeductibleFeesResult {
  preNablaDeductibleFeeAmount: Big;
  feeCurrency: RampCurrency;
}

/**
 * Helper function to calculate a fee component (absolute or relative)
 * @param feeValue - The fee value from the database
 * @param feeType - The type of fee ('absolute' or 'relative')
 * @param baseAmount - The base amount for relative calculations
 * @param baseCurrency - The currency of the base amount
 * @param targetCurrency - The target currency for the fee
 * @returns The calculated fee component as a Big number
 */
async function calculateFeeComponent(
  feeValue: Big.BigSource,
  feeType: "absolute" | "relative",
  baseAmount: string,
  baseCurrency: RampCurrency,
  targetCurrency: RampCurrency
): Promise<Big> {
  let feeComponent = new Big(0);

  if (feeType === "absolute") {
    feeComponent = new Big(feeValue);
  } else {
    // relative
    const baseAmountInTargetCurrency = await priceFeedService.convertCurrency(baseAmount, baseCurrency, targetCurrency);
    feeComponent = new Big(baseAmountInTargetCurrency).mul(feeValue);
  }

  return feeComponent;
}

/**
 * Calculate partner markup and Vortex fees
 * @param inputAmount - The input amount for the transaction
 * @param rampType - The type of ramp operation
 * @param partnerId - Optional partner id for custom fees
 * @param inputCurrency - The input currency
 * @param feeCurrency - The target fee currency
 * @returns Object containing partner markup and vortex fees as Big numbers
 */
async function calculatePartnerAndVortexFees(
  inputAmount: string,
  rampType: RampDirection,
  partnerId: string | undefined,
  inputCurrency: RampCurrency,
  feeCurrency: RampCurrency
): Promise<{ partnerMarkupFee: Big; vortexFee: Big }> {
  let totalPartnerMarkupInFeeCurrency = new Big(0);
  let totalVortexFeeInFeeCurrency = new Big(0);

  // 1. Fetch and process partner-specific configurations if partnerName is provided
  if (partnerId) {
    // Query all records where name matches partnerName AND rampType matches rampType
    const partnerRecords = await Partner.findAll({
      where: {
        id: partnerId,
        isActive: true,
        rampType: rampType
      }
    });

    if (partnerRecords.length > 0) {
      let hasApplicableFees = false;

      for (const record of partnerRecords) {
        // Partner markup fee
        if (record.markupType !== "none") {
          const markupFeeComponent = await calculateFeeComponent(
            record.markupValue,
            record.markupType as "absolute" | "relative",
            inputAmount,
            inputCurrency,
            record.markupCurrency
          );

          const markupFeeComponentInFeeCurrency = await priceFeedService.convertCurrency(
            markupFeeComponent.toString(),
            record.markupCurrency,
            feeCurrency
          );
          totalPartnerMarkupInFeeCurrency = totalPartnerMarkupInFeeCurrency.plus(markupFeeComponentInFeeCurrency);

          if (markupFeeComponent.gt(0)) {
            hasApplicableFees = true;
          }
        }

        // Vortex Fee Component from this partner record
        if (record.vortexFeeType !== "none") {
          const vortexFeeComponent = await calculateFeeComponent(
            record.vortexFeeValue,
            record.vortexFeeType as "absolute" | "relative",
            inputAmount,
            inputCurrency,
            record.markupCurrency
          );

          const vortexFeeComponentInFeeCurrency = await priceFeedService.convertCurrency(
            vortexFeeComponent.toString(),
            record.markupCurrency,
            feeCurrency
          );
          totalVortexFeeInFeeCurrency = totalVortexFeeInFeeCurrency.plus(vortexFeeComponentInFeeCurrency);

          if (vortexFeeComponent.gt(0)) {
            hasApplicableFees = true;
          }
        }
      }

      // Log warning if partner found but no applicable custom fees
      if (!hasApplicableFees) {
        logger.warn(`Partner with name '${partnerId}' found, but no active markup defined. Proceeding with default fees.`);
      }
    } else {
      // No specific partner records found, will use default Vortex fee below
      logger.warn(`No fee configuration found for partner with name '${partnerId}'. Proceeding with default fees.`);
    }
  }

  // 2. If no partner was provided initially, use default Vortex fees
  if (!partnerId) {
    // Query all vortex records for this ramp type
    const vortexFoundationPartners = await Partner.findAll({
      where: {
        isActive: true,
        name: "vortex",
        rampType: rampType
      }
    });

    if (vortexFoundationPartners.length === 0) {
      logger.error(`Vortex partner configuration not found for ${rampType}-ramp in database.`);
      throw new APIError({
        message: "Internal configuration error [VF]",
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // Process each vortex record and accumulate fees
    for (const vortexFoundationPartner of vortexFoundationPartners) {
      if (vortexFoundationPartner.markupType !== "none") {
        const vortexFeeComponent = await calculateFeeComponent(
          vortexFoundationPartner.markupValue,
          vortexFoundationPartner.markupType as "absolute" | "relative",
          inputAmount,
          inputCurrency,
          vortexFoundationPartner.markupCurrency
        );

        const vortexFeeComponentInFeeCurrency = await priceFeedService.convertCurrency(
          vortexFeeComponent.toString(),
          vortexFoundationPartner.markupCurrency,
          feeCurrency
        );
        totalVortexFeeInFeeCurrency = totalVortexFeeInFeeCurrency.plus(vortexFeeComponentInFeeCurrency);
      }
    }
  }

  return {
    partnerMarkupFee: totalPartnerMarkupInFeeCurrency,
    vortexFee: totalVortexFeeInFeeCurrency
  };
}

/**
 * Calculate anchor fees based on ramp type and destination
 * @param rampType - The type of ramp operation
 * @param from - The source destination type
 * @param to - The target destination type
 * @param inputAmount - The input amount for the transaction
 * @param outputAmount - The gross output amount before fees
 * @returns The calculated anchor fee as a Big number
 */
async function calculateAnchorFee(
  rampType: RampDirection,
  from: DestinationType,
  to: DestinationType,
  inputAmount: string,
  outputAmount: string
): Promise<Big> {
  // Determine anchor identifier based on ramp type and destination
  let anchorIdentifier = "default";
  if (rampType === RampDirection.BUY && from === "pix") {
    anchorIdentifier = "moonbeam_brla";
  } else if (rampType === RampDirection.SELL && to === "pix") {
    anchorIdentifier = "moonbeam_brla";
  } else if (rampType === RampDirection.SELL && to === "sepa") {
    anchorIdentifier = "stellar_eurc";
  } else if (rampType === RampDirection.SELL && to === "cbu") {
    anchorIdentifier = "stellar_ars";
  }

  const anchorFeeConfigs = await Anchor.findAll({
    where: {
      identifier: anchorIdentifier,
      isActive: true,
      rampType: rampType
    }
  });

  // Calculate anchor fee based on type (absolute or relative)
  let totalAnchorFee = new Big(0);
  if (anchorFeeConfigs.length > 0) {
    // Calculate total anchor fee by reducing the array
    totalAnchorFee = anchorFeeConfigs.reduce((total, feeConfig) => {
      if (feeConfig.valueType === "absolute") {
        return total.plus(feeConfig.value);
      }
      if (feeConfig.valueType === "relative") {
        // Calculate relative fee based on the input or output amount
        const amount = rampType === RampDirection.BUY ? inputAmount : outputAmount;
        const relativeFee = new Big(amount).mul(feeConfig.value);
        return total.plus(relativeFee);
      }
      return total;
    }, new Big(0));
  }

  return totalAnchorFee;
}

/**
 * Calculate fees that are deducted before the Nabla swap
 * @param inputAmount - The original user input amount
 * @param inputCurrency - The input currency
 * @param outputCurrency - The output currency
 * @param rampType - The type of ramp operation
 * @param from - The source destination type
 * @param to - The target destination type
 * @param partnerId - Optional partner id for custom fees
 * @returns Promise resolving to the pre-Nabla deductible fees
 */
export async function calculatePreNablaDeductibleFees(
  inputAmount: string,
  inputCurrency: RampCurrency,
  outputCurrency: RampCurrency,
  rampType: RampDirection,
  from: DestinationType,
  to: DestinationType,
  partnerId?: string
): Promise<PreNablaDeductibleFeesResult> {
  try {
    // Validate chain support
    validateChainSupport(rampType, from, to);

    // Determine the target fiat currency for fees
    const feeCurrency = getTargetFiatCurrency(rampType, inputCurrency, outputCurrency);

    let preNablaDeductibleFeeAmount = new Big(0);

    if (rampType === RampDirection.BUY) {
      // For on-ramp: Only Anchor Fee is deducted before Nabla
      const anchorFee = await calculateAnchorFee(rampType, from, to, inputAmount, inputAmount);

      // Convert anchor fee to fee currency if needed
      if (feeCurrency !== inputCurrency) {
        const anchorFeeInFeeCurrency = await priceFeedService.convertCurrency(anchorFee.toString(), inputCurrency, feeCurrency);
        preNablaDeductibleFeeAmount = new Big(anchorFeeInFeeCurrency);
      } else {
        preNablaDeductibleFeeAmount = anchorFee;
      }
    } else {
      // For off-ramp: Vortex Fee + Partner Markup Fee
      const { partnerMarkupFee, vortexFee } = await calculatePartnerAndVortexFees(
        inputAmount,
        rampType,
        partnerId,
        inputCurrency,
        feeCurrency
      );

      preNablaDeductibleFeeAmount = vortexFee.plus(partnerMarkupFee);
    }

    return {
      feeCurrency,
      preNablaDeductibleFeeAmount
    };
  } catch (error) {
    logger.error("Error calculating pre-Nabla deductible fees:", error);

    throw new APIError({
      message: QuoteError.FailedToCalculatePreNablaDeductibleFees,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}

/**
 * Main function to calculate all fee components for a quote
 * @param request - The fee calculation request parameters
 * @returns Promise resolving to the calculated fee components
 */
export async function calculateFeeComponents(request: CalculateFeeComponentsRequest): Promise<FeeComponentsResult> {
  try {
    // Validate chain support
    validateChainSupport(request.rampType, request.from, request.to);

    // Determine the target fiat currency for fees
    const feeCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    // Calculate partner markup and Vortex fees
    const { partnerMarkupFee, vortexFee } = await calculatePartnerAndVortexFees(
      request.inputAmount,
      request.rampType,
      request.partnerName,
      request.inputCurrency,
      feeCurrency
    );

    // Calculate anchor fees
    const anchorFee = await calculateAnchorFee(
      request.rampType,
      request.from,
      request.to,
      request.inputAmount,
      request.outputAmountOfframp
    );

    // Convert anchor fee to fee currency if needed
    let anchorFeeInFeeCurrency = anchorFee;
    if (feeCurrency !== request.inputCurrency && feeCurrency !== request.outputCurrency) {
      // Determine the base currency for anchor fee conversion
      const baseCurrency = request.rampType === RampDirection.BUY ? request.inputCurrency : request.outputCurrency;
      const anchorFeeConverted = await priceFeedService.convertCurrency(anchorFee.toString(), baseCurrency, feeCurrency);
      anchorFeeInFeeCurrency = new Big(anchorFeeConverted);
    }

    return {
      anchorFee: anchorFeeInFeeCurrency.toFixed(2),
      feeCurrency,
      partnerMarkupFee: partnerMarkupFee.toFixed(2),
      vortexFee: vortexFee.toFixed(2)
    };
  } catch (error) {
    logger.error("Error calculating fee components:", error);
    throw new APIError({
      message: QuoteError.FailedToCalculateFeeComponents,
      status: httpStatus.INTERNAL_SERVER_ERROR
    });
  }
}
