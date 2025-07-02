import {
  CreateQuoteRequest,
  EvmToken,
  FiatToken,
  OnChainToken,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency
} from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { v4 as uuidv4 } from "uuid";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import QuoteTicket, { QuoteTicketMetadata } from "../../../../models/quoteTicket.model";
import { APIError } from "../../../errors/api-error";
import { multiplyByPowerOfTen } from "../../pendulum/helpers";
import { priceFeedService } from "../../priceFeed.service";
import { BaseRampService } from "../base.service";
import { calculateEvmBridgeAndNetworkFee, calculateNablaSwapOutput, getEvmBridgeQuote } from "./gross-output";
import { getTargetFiatCurrency, trimTrailingZeros, validateChainSupport } from "./helpers";
import { calculateFeeComponents, calculatePreNablaDeductibleFees } from "./quote-fees";

async function calculateInputAmountForNablaSwap(
  request: CreateQuoteRequest,
  preNablaDeductibleFeeInInputCurrency: Big.BigSource,
  preNablaDeductibleFeeAmount: Big.BigSource
) {
  if (request.rampType === "off" && request.from !== "assethub") {
    // Check squidrouter rate and adjust the input amount accordingly
    const bridgeQuote = await getEvmBridgeQuote({
      amountDecimal: request.inputAmount,
      inputOrOutputCurrency: request.inputCurrency as OnChainToken,
      rampType: request.rampType,
      sourceOrDestination: request.from
    });
    return new Big(bridgeQuote.outputAmountDecimal).minus(preNablaDeductibleFeeAmount);
  } else {
    return new Big(request.inputAmount).minus(preNablaDeductibleFeeInInputCurrency);
  }
}

export class QuoteService extends BaseRampService {
  public async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    // a. Initial Setup
    validateChainSupport(request.rampType, request.from, request.to);

    // Fetch partner details
    let partner = null;
    if (request.partnerId) {
      partner = await Partner.findOne({
        where: {
          isActive: true,
          name: request.partnerId
        }
      });

      // If partnerId (name) was provided but not found or not active, log a warning and proceed without a partner
      if (!partner) {
        logger.warn(`Partner with name '${request.partnerId}' not found or not active. Proceeding with default fees.`);
      }
    }

    // Determine the target fiat currency for fees
    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    // b. Calculate Pre-Nabla Deductible Fees
    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      request.inputAmount,
      request.inputCurrency,
      request.outputCurrency,
      request.rampType,
      request.from,
      request.to,
      request.partnerId
    );

    // c. Calculate inputAmountForNablaSwap
    // Convert preNablaDeductibleFeeAmount from feeCurrency to request.inputCurrency
    const preNablaDeductibleFeeInInputCurrency = await priceFeedService.convertCurrency(
      preNablaDeductibleFeeAmount.toString(),
      feeCurrency,
      request.inputCurrency
    );

    const inputAmountForNablaSwap = await calculateInputAmountForNablaSwap(
      request,
      preNablaDeductibleFeeInInputCurrency,
      preNablaDeductibleFeeAmount
    );

    // Ensure inputAmountForNablaSwap is not negative
    if (inputAmountForNablaSwap.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover fees.",
        status: httpStatus.BAD_REQUEST
      });
    }

    // d. Perform Nabla Swap
    // Determine nablaOutputCurrency based on ramp type and destination
    let nablaOutputCurrency: RampCurrency;

    if (request.rampType === "on") {
      // On-Ramp: intermediate currency on Pendulum/Moonbeam
      if (request.to === "assethub") {
        nablaOutputCurrency = request.outputCurrency; // Direct to target OnChainToken
      } else {
        nablaOutputCurrency = EvmToken.USDC; // Use USDC as intermediate for EVM destinations
      }
    } else {
      // Off-Ramp: fiat-representative token on Pendulum
      if (request.to === "pix") {
        nablaOutputCurrency = FiatToken.BRL;
      } else if (request.to === "sepa") {
        nablaOutputCurrency = FiatToken.EURC;
      } else if (request.to === "cbu") {
        nablaOutputCurrency = FiatToken.ARS;
      } else {
        throw new APIError({
          message: `Unsupported off-ramp destination: ${request.to}`,
          status: httpStatus.BAD_REQUEST
        });
      }
    }

    const nablaSwapResult = await calculateNablaSwapOutput({
      fromPolkadotDestination: request.from,
      inputAmountForSwap: inputAmountForNablaSwap.toString(),
      inputCurrency: request.inputCurrency,
      nablaOutputCurrency,
      rampType: request.rampType,
      toPolkadotDestination: request.to
    });

    // e. Calculate Full Fee Breakdown
    const outputAmountOfframp = nablaSwapResult.nablaOutputAmountDecimal.toString();

    const {
      vortexFee,
      anchorFee,
      partnerMarkupFee,
      feeCurrency: calculatedFeeCurrency
    } = await calculateFeeComponents({
      from: request.from,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      outputAmountOfframp,
      outputCurrency: request.outputCurrency,
      partnerName: request.partnerId,
      rampType: request.rampType,
      to: request.to
    });

    // f. Aggregate and Finalize Fees
    // Convert other fees to targetFeeFiatCurrency if needed
    let vortexFeeFiat = vortexFee;
    let anchorFeeFiat = anchorFee;
    let partnerMarkupFeeFiat = partnerMarkupFee;

    if (calculatedFeeCurrency !== targetFeeFiatCurrency) {
      vortexFeeFiat = await priceFeedService.convertCurrency(vortexFee, calculatedFeeCurrency, targetFeeFiatCurrency);
      anchorFeeFiat = await priceFeedService.convertCurrency(anchorFee, calculatedFeeCurrency, targetFeeFiatCurrency);
      partnerMarkupFeeFiat = await priceFeedService.convertCurrency(
        partnerMarkupFee,
        calculatedFeeCurrency,
        targetFeeFiatCurrency
      );
    }

    // USD Fee Structure for metadata
    const usdCurrency = EvmToken.USDC;
    const vortexFeeUsd = await priceFeedService.convertCurrency(vortexFeeFiat, targetFeeFiatCurrency, usdCurrency);
    const anchorFeeUsd = await priceFeedService.convertCurrency(anchorFeeFiat, targetFeeFiatCurrency, usdCurrency);
    const partnerMarkupFeeUsd = await priceFeedService.convertCurrency(
      partnerMarkupFeeFiat,
      targetFeeFiatCurrency,
      usdCurrency
    );

    // g. Handle EVM Bridge/Swap (If On-Ramp to EVM non-AssetHub)
    let squidRouterNetworkFeeUSD = "0";
    let finalGrossOutputAmountDecimal = nablaSwapResult.nablaOutputAmountDecimal;
    let outputAmountMoonbeamRaw = nablaSwapResult.nablaOutputAmountRaw;

    // If onramp, EURC does not collect fees for now.
    if (request.rampType === "on" && request.inputCurrency === FiatToken.BRL && request.to !== "assethub") {
      // Do a first call to get a rough estimate of network fees
      const preliminaryResult = await calculateEvmBridgeAndNetworkFee({
        finalEvmDestination: request.to,
        finalOutputCurrency: request.outputCurrency as OnChainToken,
        intermediateAmountRaw: nablaSwapResult.nablaOutputAmountRaw,
        originalInputAmountForRateCalc: inputAmountForNablaSwap.toString(),
        rampType: request.rampType
      });
      squidRouterNetworkFeeUSD = preliminaryResult.networkFeeUSD;

      // Deduct all the fees that are distributed after the Nabla swap and before the EVM bridge
      const outputAmountMoonbeamDecimal = new Big(nablaSwapResult.nablaOutputAmountDecimal)
        .minus(vortexFeeUsd)
        .minus(partnerMarkupFeeUsd)
        .minus(squidRouterNetworkFeeUSD);
      // axlUSDC on Moonbeam is 6 decimals
      outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, 6).toString();

      // Do a second call with all fees deducted to get the final gross output amount
      const evmBridgeResult = await calculateEvmBridgeAndNetworkFee({
        finalEvmDestination: request.to,
        finalOutputCurrency: request.outputCurrency as OnChainToken,
        intermediateAmountRaw: outputAmountMoonbeamRaw,
        originalInputAmountForRateCalc: inputAmountForNablaSwap.toString(),
        rampType: request.rampType
      });

      finalGrossOutputAmountDecimal = new Big(evmBridgeResult.finalGrossOutputAmountDecimal);
    }

    const squidRouterNetworkFeeFiat = await priceFeedService.convertCurrency(
      squidRouterNetworkFeeUSD,
      usdCurrency,
      targetFeeFiatCurrency
    );
    // Network fee is only the Squidrouter fee for now
    const networkFeeFiatForTotal = squidRouterNetworkFeeFiat;

    // Calculate total fee in fiat
    const totalFeeFiat = new Big(networkFeeFiatForTotal)
      .plus(vortexFeeFiat)
      .plus(anchorFeeFiat)
      .plus(partnerMarkupFeeFiat)
      .toFixed(2);

    // Network fee is only the Squidrouter fee for now
    const totalNetworkFeeUsd = squidRouterNetworkFeeUSD;
    const totalFeeUsd = new Big(totalNetworkFeeUsd).plus(vortexFeeUsd).plus(anchorFeeUsd).plus(partnerMarkupFeeUsd).toFixed(6);

    // h. Calculate Final Net Output Amount
    let finalNetOutputAmount: Big;

    if (request.rampType === "on") {
      if (request.to === "assethub") {
        // Convert totalFeeFiat to output currency
        const totalFeeInOutputCurrency = await priceFeedService.convertCurrency(
          // We already deducted pre-Nabla fees in the earlier calculations, so we add them back here so we don't double-deduct
          new Big(totalFeeFiat)
            .minus(preNablaDeductibleFeeAmount)
            .toString(),
          targetFeeFiatCurrency,
          request.outputCurrency
        );
        finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputCurrency);
      } else {
        // For on-ramp to EVM, we already deduced the final output amount in the EVM bridge calculation
        finalNetOutputAmount = finalGrossOutputAmountDecimal;
      }
    } else {
      // For off-ramp, convert totalFeeFiat to the fiat-representative currency amount
      const totalFeeInOutputFiat = await priceFeedService.convertCurrency(
        // We already deducted pre-Nabla fees in the earlier calculations, so we add them back here so we don't double-deduct
        new Big(totalFeeFiat)
          .minus(preNablaDeductibleFeeAmount)
          .toString(),
        targetFeeFiatCurrency,
        request.outputCurrency
      );
      finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputFiat);
    }

    // Validate final output amount
    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: "Input amount too low to cover calculated fees.",
        status: httpStatus.BAD_REQUEST
      });
    }

    const finalNetOutputAmountStr =
      request.rampType === "on" ? finalNetOutputAmount.toFixed(6, 0) : finalNetOutputAmount.toFixed(2, 0);

    // i. Store and Return Quote
    const feeToStore: QuoteFeeStructure = {
      anchor: anchorFeeFiat,
      currency: targetFeeFiatCurrency,
      network: networkFeeFiatForTotal,
      partnerMarkup: partnerMarkupFeeFiat,
      total: totalFeeFiat,
      vortex: vortexFeeFiat
    };

    const usdFeeStructure = {
      anchor: anchorFeeUsd,
      currency: "USD",
      network: totalNetworkFeeUsd,
      partnerMarkup: partnerMarkupFeeUsd,
      total: totalFeeUsd,
      vortex: vortexFeeUsd
    };

    // This is the final net output amount before anchor fees are deducted
    const offrampAmountBeforeAnchorFees =
      request.rampType === "off" ? new Big(finalNetOutputAmountStr).plus(anchorFeeFiat).toFixed() : undefined;

    // This is the amount that will end up on Moonbeam just before doing the final step with the squidrouter transaction
    const onrampOutputAmountMoonbeamRaw = request.rampType === "on" ? outputAmountMoonbeamRaw : undefined;

    // Create QuoteTicket
    const quote = await QuoteTicket.create({
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: feeToStore,
      from: request.from,
      id: uuidv4(),
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata: {
        inputAmountForNablaSwapDecimal: inputAmountForNablaSwap.toFixed(undefined, 0),
        offrampAmountBeforeAnchorFees,
        onrampOutputAmountMoonbeamRaw,
        usdFeeStructure
      } as QuoteTicketMetadata,
      outputAmount: finalNetOutputAmountStr,
      outputCurrency: request.outputCurrency,
      partnerId: partner?.id || null,
      rampType: request.rampType, // 10 minutes from now
      status: "pending",
      to: request.to
    });

    // Format and return the response
    const responseFeeStructure: QuoteFeeStructure = {
      anchor: trimTrailingZeros(anchorFeeFiat),
      currency: targetFeeFiatCurrency,
      network: trimTrailingZeros(networkFeeFiatForTotal),
      partnerMarkup: trimTrailingZeros(partnerMarkupFeeFiat),
      total: trimTrailingZeros(totalFeeFiat),
      vortex: trimTrailingZeros(vortexFeeFiat)
    };

    return {
      expiresAt: quote.expiresAt,
      fee: responseFeeStructure,
      from: quote.from,
      id: quote.id,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(finalNetOutputAmountStr),
      outputCurrency: quote.outputCurrency,
      rampType: quote.rampType,
      to: quote.to
    };
  }

  public async getQuote(id: string): Promise<QuoteResponse | null> {
    const quote = await this.getQuoteTicket(id);

    if (!quote) {
      return null;
    }

    const responseFeeStructure: QuoteFeeStructure = {
      anchor: trimTrailingZeros(quote.fee.anchor),
      currency: quote.fee.currency,
      network: trimTrailingZeros(quote.fee.network),
      partnerMarkup: trimTrailingZeros(quote.fee.partnerMarkup),
      total: trimTrailingZeros(quote.fee.total),
      vortex: trimTrailingZeros(quote.fee.vortex)
    };

    return {
      expiresAt: quote.expiresAt,
      fee: responseFeeStructure,
      from: quote.from,
      id: quote.id,
      inputAmount: trimTrailingZeros(quote.inputAmount),
      inputCurrency: quote.inputCurrency,
      outputAmount: trimTrailingZeros(quote.outputAmount),
      outputCurrency: quote.outputCurrency,
      rampType: quote.rampType,
      to: quote.to
    };
  }
}

export default new QuoteService();
