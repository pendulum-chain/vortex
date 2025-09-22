import {
  CreateQuoteRequest,
  EvmToken,
  FiatToken,
  getNetworkFromDestination,
  getPendulumDetails,
  Networks,
  OnChainToken,
  QuoteError,
  QuoteFeeStructure,
  QuoteResponse,
  RampCurrency,
  RampDirection
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
import { createQuoteContext } from "./core/quote-context";
import { buildEnginesRegistry, QuoteOrchestrator } from "./core/quote-orchestrator";
import { BridgeEngine } from "./engines/bridge-engine";
import { DiscountEngine } from "./engines/discount-engine";
import { FeeEngine } from "./engines/fee-engine";
import { FinalizeEngine } from "./engines/finalize-engine";
import { InputPlannerEngine } from "./engines/input-planner";
import { SpecialOnrampEurEvmEngine } from "./engines/special-onramp-eur-evm";
import { SwapEngine } from "./engines/swap-engine";
import { calculateNablaSwapOutput, getEvmBridgeQuote } from "./gross-output";
import { getTargetFiatCurrency, trimTrailingZeros, validateChainSupport } from "./helpers";
import { calculateFeeComponents, calculatePreNablaDeductibleFees } from "./quote-fees";
import { RouteResolver } from "./routes/route-resolver";
import { StageKey } from "./types";
import { validateAmountLimits } from "./validation-helpers";

/*
 * Calculate the input amount to be used for the Nabla swap after deducting pre-Nabla fees.
 * Converts pre-Nabla fees into the representative input currency on Pendulum before deduction.
 * For non-AssetHub off-ramps, adjusts the input by the Squidrouter bridge quote.
 */
async function calculateInputAmountForNablaSwap(
  request: CreateQuoteRequest,
  preNablaDeductibleFeeAmount: Big.BigSource,
  feeCurrency: RampCurrency
) {
  const network = getNetworkFromDestination(request.from);
  const representativeCurrency = getPendulumDetails(request.inputCurrency, network).currency;
  const preNablaDeductibleFeeInInputRepresentativeCurrency = await priceFeedService.convertCurrency(
    preNablaDeductibleFeeAmount.toString(),
    feeCurrency,
    representativeCurrency
  );

  // For off-ramps using Squidrouter (non-AssetHub), adjust the input amount based on bridge rate.
  if (request.rampType === RampDirection.SELL && request.from !== "assethub") {
    const bridgeQuote = await getEvmBridgeQuote({
      amountDecimal: request.inputAmount,
      fromNetwork: request.from as Networks,
      inputCurrency: request.inputCurrency as OnChainToken,
      outputCurrency: EvmToken.AXLUSDC as unknown as OnChainToken,
      rampType: request.rampType,
      toNetwork: Networks.Moonbeam
    });
    return new Big(bridgeQuote.outputAmountDecimal).minus(preNablaDeductibleFeeInInputRepresentativeCurrency);
  }

  // For AssetHub off-ramps and all on-ramps, directly deduct pre-Nabla fees
  return new Big(request.inputAmount).minus(preNablaDeductibleFeeInInputRepresentativeCurrency);
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
          name: request.partnerId,
          rampType: request.rampType
        }
      });

      // If partnerId (name) was provided but not found or not active, log a warning and proceed without a partner
      if (!partner) {
        logger.warn(`Partner with name '${request.partnerId}' not found or not active. Proceeding with default fees.`);
      }
    }

    if (request.rampType === RampDirection.BUY) {
      //validateAmountLimits(request.inputAmount, request.inputCurrency as FiatToken, "max", request.rampType);
    }

    // Determine the target fiat currency for fees
    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.EURC && request.to !== "assethub") {
      const resolver = new RouteResolver();
      const engines = buildEnginesRegistry({
        [StageKey.SpecialOnrampEurEvm]: new SpecialOnrampEurEvmEngine()
      });
      const orchestrator = new QuoteOrchestrator(engines);

      const ctx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(ctx);
      await orchestrator.run(strategy, ctx);

      if (ctx.builtResponse) {
        return ctx.builtResponse;
      }
    }

    // On-ramp to AssetHub is fully handled by the pipeline (input planning, swap, fees, discount, finalize, persistence)
    if (request.rampType === RampDirection.BUY && request.to === "assethub") {
      const resolver = new RouteResolver();
      const engines = buildEnginesRegistry({
        [StageKey.InputPlanner]: new InputPlannerEngine(),
        [StageKey.Swap]: new SwapEngine(),
        [StageKey.Fee]: new FeeEngine(),
        [StageKey.Discount]: new DiscountEngine(),
        [StageKey.Finalize]: new FinalizeEngine()
      });
      const orchestrator = new QuoteOrchestrator(engines);

      const pipelineCtx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(pipelineCtx);
      await orchestrator.run(strategy, pipelineCtx);

      if (!pipelineCtx.builtResponse) {
        throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
      }
      return pipelineCtx.builtResponse;
    }

    // On-ramp to EVM (non-EUR): run pipeline stages (input planning, swap, fee, discount, bridge)
    let evmPipelineCtx: ReturnType<typeof createQuoteContext> | undefined;
    if (request.rampType === RampDirection.BUY && request.to !== "assethub" && request.inputCurrency !== FiatToken.EURC) {
      const resolver = new RouteResolver();
      const engines = buildEnginesRegistry({
        [StageKey.InputPlanner]: new InputPlannerEngine(),
        [StageKey.Swap]: new SwapEngine(),
        [StageKey.Fee]: new FeeEngine(),
        [StageKey.Discount]: new DiscountEngine(),
        [StageKey.Bridge]: new BridgeEngine(),
        [StageKey.Finalize]: new FinalizeEngine()
      });
      const orchestrator = new QuoteOrchestrator(engines);

      evmPipelineCtx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(evmPipelineCtx);
      await orchestrator.run(strategy, evmPipelineCtx);

      // If FinalizeEngine built a response, return it now to avoid legacy duplication
      if (evmPipelineCtx.builtResponse) {
        return evmPipelineCtx.builtResponse;
      }
    }

    // All BUY routes are now handled by the pipeline strategies above.
    // If we reach here with a BUY request, treat as failure to compute via pipeline.
    if (request.rampType === RampDirection.BUY) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    // SELL routes are now handled by the pipeline (InputPlanner -> Swap -> Fee -> Discount -> Finalize)
    if (request.rampType === RampDirection.SELL) {
      const resolver = new RouteResolver();
      const engines = buildEnginesRegistry({
        [StageKey.InputPlanner]: new InputPlannerEngine(),
        [StageKey.Swap]: new SwapEngine(),
        [StageKey.Fee]: new FeeEngine(),
        [StageKey.Discount]: new DiscountEngine(),
        [StageKey.Finalize]: new FinalizeEngine()
      });
      const orchestrator = new QuoteOrchestrator(engines);

      const sellCtx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(sellCtx);
      await orchestrator.run(strategy, sellCtx);

      if (!sellCtx.builtResponse) {
        throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
      }
      return sellCtx.builtResponse;
    }

    // b. Calculate Pre-Nabla Deductible Fees
    const { preNablaDeductibleFeeAmount, feeCurrency } = await calculatePreNablaDeductibleFees(
      request.inputAmount,
      request.inputCurrency,
      request.outputCurrency,
      request.rampType,
      request.from,
      request.to,
      partner?.id || undefined
    );

    // c. Calculate inputAmountForNablaSwap
    const inputAmountForNablaSwap = await calculateInputAmountForNablaSwap(request, preNablaDeductibleFeeAmount, feeCurrency);

    // Ensure inputAmountForNablaSwap is not negative
    if (inputAmountForNablaSwap.lte(0)) {
      throw new APIError({
        message: QuoteError.InputAmountTooLowToCoverFees,
        status: httpStatus.BAD_REQUEST
      });
    }

    // d. Perform Nabla Swap
    // Since BUY routes are handled by the pipeline above, this legacy path only handles SELL
    let nablaOutputCurrency: RampCurrency;
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

    const nablaSwapResult = await calculateNablaSwapOutput({
      fromPolkadotDestination: request.from,
      inputAmountForSwap: (inputAmountForNablaSwap as Big).toString(),
      inputCurrency: request.inputCurrency,
      nablaOutputCurrency,
      rampType: request.rampType,
      toPolkadotDestination: request.to
    });

    // Legacy path is SELL only
    validateAmountLimits(
      nablaSwapResult.nablaOutputAmountDecimal,
      request.outputCurrency as FiatToken,
      "max",
      request.rampType
    );

    // e. Calculate Full Fee Breakdown
    const outputAmountOfframp = nablaSwapResult.nablaOutputAmountDecimal.toString();

    // e. Calculate Full Fee Breakdown
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
      partnerName: partner?.id || undefined,
      rampType: request.rampType,
      to: request.to
    });

    // Convert to display fiat if needed
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
    // g. Network fees (SELL legacy path does not include Squidrouter fees; set to zero)
    const squidRouterNetworkFeeUSD = "0";
    const finalGrossOutputAmountDecimal = nablaSwapResult.nablaOutputAmountDecimal;
    const outputAmountMoonbeamRaw = undefined;

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

    // h. Calculate Final Net Output Amount (SELL)
    let finalNetOutputAmount: Big;
    const totalFeeInOutputFiat = await priceFeedService.convertCurrency(
      new Big(totalFeeFiat).minus(preNablaDeductibleFeeAmount).toString(),
      targetFeeFiatCurrency,
      request.outputCurrency
    );
    finalNetOutputAmount = finalGrossOutputAmountDecimal.minus(totalFeeInOutputFiat);

    // Validate final output amount
    if (finalNetOutputAmount.lte(0)) {
      throw new APIError({
        message: QuoteError.InputAmountTooLowToCoverCalculatedFees,
        status: httpStatus.BAD_REQUEST
      });
    }

    if (request.rampType === RampDirection.SELL) {
      validateAmountLimits(finalNetOutputAmount, request.outputCurrency as FiatToken, "min", request.rampType);
    } else {
      validateAmountLimits(request.inputAmount, request.inputCurrency as FiatToken, "min", request.rampType);
    }

    // Apply discount subsidy if partner has discount > 0
    let discountSubsidyAmount = new Big(0);
    let discountSubsidyInfo: { partnerId: string; discount: string; subsidyAmountInOutputToken: string } | undefined;
    // The subsidy partner is either the partner provided in the request or the default "vortex" partner
    const discountSubsidyPartner = partner
      ? partner
      : await Partner.findOne({
          where: {
            isActive: true,
            name: "vortex",
            rampType: request.rampType
          }
        });

    // On-ramp Moonbeam raw output is not used for SELL legacy path; persist as "0" to satisfy metadata typing
    const onrampOutputAmountMoonbeamRaw = "0";

    if (discountSubsidyPartner && discountSubsidyPartner.discount > 0) {
      // Calculate discount subsidy as percentage of finalNetOutputAmount. `discount` is a decimal (e.g., 0.05 for 5%)
      discountSubsidyAmount = finalNetOutputAmount.mul(discountSubsidyPartner.discount);

      // Add discount subsidy to finalNetOutputAmount (relevant for the subsidy of off-ramps)
      finalNetOutputAmount = finalNetOutputAmount.plus(discountSubsidyAmount);

      // No on-ramp Moonbeam subsidy path in SELL legacy calculation

      discountSubsidyInfo = {
        discount: discountSubsidyPartner.discount.toString(),
        partnerId: discountSubsidyPartner.id,
        subsidyAmountInOutputToken: discountSubsidyAmount.toFixed(6, 0)
      };
    }

    const finalNetOutputAmountStr = finalNetOutputAmount.toFixed(2, 0);

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
      request.rampType === RampDirection.SELL ? new Big(finalNetOutputAmountStr).plus(anchorFeeFiat).toFixed() : undefined;

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
        subsidy: discountSubsidyInfo,
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
