import {
  AssetHubToken,
  AXL_USDC_MOONBEAM,
  createGenericRouteParams,
  CreateQuoteRequest,
  ERC20_EURE_POLYGON,
  ERC20_EURE_POLYGON_DECIMALS,
  EvmToken,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPendulumDetails,
  getRoute,
  isAssetHubTokenDetails,
  isOnChainToken,
  Networks,
  OnChainToken,
  parseContractBalanceResponse,
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
import { calculateEvmBridgeAndNetworkFee, calculateNablaSwapOutput, EvmBridgeRequest, getEvmBridgeQuote } from "./gross-output";
import { getTargetFiatCurrency, trimTrailingZeros, validateChainSupport } from "./helpers";
import { calculateFeeComponents, calculatePreNablaDeductibleFees } from "./quote-fees";
import { validateAmountLimits } from "./validation-helpers";
import { QuoteOrchestrator, buildEnginesRegistry } from "./core/quote-orchestrator";
import { RouteResolver } from "./routes/route-resolver";
import { SpecialOnrampEurEvmEngine } from "./engines/special-onramp-eur-evm";
import { createQuoteContext } from "./core/quote-context";
import { StageKey } from "./types";
import { InputPlannerEngine } from "./engines/input-planner";
import { SwapEngine } from "./engines/swap-engine";
import { FeeEngine } from "./engines/fee-engine";
import { DiscountEngine } from "./engines/discount-engine";
import { FinalizeEngine } from "./engines/finalize-engine";

/*
 * Calculate the input amount to be used for the Nabla swap after deducting pre-Nabla fees.
 * @param request - The quote request details.
 * @param preNablaDeductibleFeeAmount - The total pre-Nabla deductible fee amount in feeCurrency.
 * @param feeCurrency - The currency in which the pre-Nabla deductible fee amount is denoted.
 */
async function calculateInputAmountForNablaSwap(
  request: CreateQuoteRequest,
  preNablaDeductibleFeeAmount: Big.BigSource,
  feeCurrency: RampCurrency
) {
  // Convert the preNablaDeductibleFeeAmount from feeCurrency to the respective input currency used for the nabla swap
  // Since some assets are not directly supported by Nabla, we need to convert the fee to the representative currency
  // For example, the representative for ETH on Pendulum is axlUSDC.
  const network = getNetworkFromDestination(request.from);
  const representativeCurrency = getPendulumDetails(request.inputCurrency, network).currency;
  const preNablaDeductibleFeeInInputRepresentativeCurrency = await priceFeedService.convertCurrency(
    preNablaDeductibleFeeAmount.toString(),
    feeCurrency,
    representativeCurrency
  );

  // For off-ramps using squidrouter (non-Assethub), we need to adjust the input amount based on the bridge rate.
  // For Assethub offramps and all onramps, we can directly deduct the fees from the input amount.
  if (request.rampType === RampDirection.SELL && request.from !== "assethub") {
    // Check squidrouter rate and adjust the input amount accordingly
    const bridgeQuote = await getEvmBridgeQuote({
      amountDecimal: request.inputAmount,
      inputCurrency: request.inputCurrency as OnChainToken,
      outputCurrency: AXL_USDC_MOONBEAM,
      rampType: request.rampType,
      fromNetwork: request.from,
      toNetwork: Networks.Moonbeam
    });
    return new Big(bridgeQuote.outputAmountDecimal).minus(preNablaDeductibleFeeInInputRepresentativeCurrency);
  } else if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.EURC && request.to === "assethub") {
    // For Monerium onramps to Assethub, we need to convert EURC to axlUSDC on Moonbeam first
    const bridgeQuote = await getEvmBridgeQuote({
      amountDecimal: request.inputAmount,
      inputOrOutputCurrency: request.inputCurrency as OnChainToken,
      rampType: request.rampType,
      sourceOrDestination: request.to
    });
    return new Big(bridgeQuote.outputAmountDecimal).minus(preNablaDeductibleFeeInInputRepresentativeCurrency);
  } else {
    return new Big(request.inputAmount).minus(preNablaDeductibleFeeInInputRepresentativeCurrency);
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

    // PR2: Delegate EUR on-ramp to EVM special-case to the orchestrator for behavior parity
    if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.EURC) {
      const resolver = new RouteResolver();
      const engines = buildEnginesRegistry({
        [StageKey.SpecialOnrampEurEvm]: new SpecialOnrampEurEvmEngine()
      });
      const orchestrator = new QuoteOrchestrator(engines);

      const ctx = createQuoteContext({
        request,
        targetFeeFiatCurrency,
        partner: partner ? { id: partner.id, discount: partner.discount, name: partner.name } : { id: null }
      });

      const strategy = resolver.resolve(ctx);
      await orchestrator.run(strategy, ctx);

      if (ctx.builtResponse) {
        return ctx.builtResponse;
      }
    }

    // PR3: For on-ramp to AssetHub, compute pre-Nabla input and Nabla swap via engines (no behavior change overall)
    let pr3Ctx: ReturnType<typeof createQuoteContext> | undefined;
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

      pr3Ctx = createQuoteContext({
        request,
        targetFeeFiatCurrency,
        partner: partner ? { id: partner.id, discount: partner.discount, name: partner.name } : { id: null }
      });

      const strategy = resolver.resolve(pr3Ctx);
      await orchestrator.run(strategy, pr3Ctx);

      // If FinalizeEngine built a response (PR5), return it now to avoid legacy duplication
      if (pr3Ctx.builtResponse) {
        return pr3Ctx.builtResponse;
      }
    }

    // b. Calculate Pre-Nabla Deductible Fees (use PR3 engine output if available)
    let preNablaDeductibleFeeAmount: Big;
    let feeCurrency: RampCurrency;
    if (pr3Ctx?.preNabla?.deductibleFeeAmount && pr3Ctx.preNabla.feeCurrency) {
      preNablaDeductibleFeeAmount = pr3Ctx.preNabla.deductibleFeeAmount;
      feeCurrency = pr3Ctx.preNabla.feeCurrency;
    } else {
      const result = await calculatePreNablaDeductibleFees(
        request.inputAmount,
        request.inputCurrency,
        request.outputCurrency,
        request.rampType,
        request.from,
        request.to,
        partner?.id || undefined
      );
      preNablaDeductibleFeeAmount = result.preNablaDeductibleFeeAmount;
      feeCurrency = result.feeCurrency;
    }

    // c. Calculate inputAmountForNablaSwap (use PR3 engine output if available)
    const inputAmountForNablaSwap =
      pr3Ctx?.preNabla?.inputAmountForSwap ??
      (await calculateInputAmountForNablaSwap(request, preNablaDeductibleFeeAmount, feeCurrency));

    // Ensure inputAmountForNablaSwap is not negative
    if (inputAmountForNablaSwap.lte(0)) {
      throw new APIError({
        message: QuoteError.InputAmountTooLowToCoverFees,
        status: httpStatus.BAD_REQUEST
      });
    }

    // d. Perform Nabla Swap
    // Determine nablaOutputCurrency based on ramp type and destination
    let nablaOutputCurrency: RampCurrency;

    if (request.rampType === RampDirection.BUY) {
      // On-Ramp: intermediate currency on Pendulum/Moonbeam
      if (request.to === "assethub") {
        nablaOutputCurrency = AssetHubToken.USDC; // Only USDC is supported on the Nabla DEX on Pendulum
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

    if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.EURC) {
      const inputAmountPostAnchorFeeRaw = multiplyByPowerOfTen(request.inputAmount, ERC20_EURE_POLYGON_DECIMALS).toFixed(0, 0);
      const fromToken = ERC20_EURE_POLYGON;
      const fromNetwork = Networks.Polygon; // Always Polygon for EUR onramp
      const toNetwork = getNetworkFromDestination(request.to);

      // validate networks, tokens.
      if (!toNetwork) {
        throw new APIError({
          message: `Invalid network for destination: ${request.to} `,
          status: httpStatus.BAD_REQUEST
        });
      }

      if (!isOnChainToken(request.outputCurrency)) {
        throw new APIError({
          message: `Output currency cannot be fiat token ${request.outputCurrency} for EUR onramp.`,
          status: httpStatus.BAD_REQUEST
        });
      }

      const outputTokenDetails = getOnChainTokenDetails(toNetwork, request.outputCurrency);
      if (!outputTokenDetails) {
        throw new APIError({
          message: `Output token details not found for ${request.outputCurrency} on network ${toNetwork}`,
          status: httpStatus.BAD_REQUEST
        });
      }

      if (isAssetHubTokenDetails(outputTokenDetails)) {
        throw new APIError({
          message: `AssetHub token ${request.outputCurrency} is not supported for onramp.`,
          status: httpStatus.BAD_REQUEST
        });
      }

      const routeParams = createGenericRouteParams({
        fromAddress: "0x30a300612ab372cc73e53ffe87fb73d62ed68da3", // Placeholder address
        amount: inputAmountPostAnchorFeeRaw,
        fromToken,
        toToken: outputTokenDetails.erc20AddressSourceChain,
        fromNetwork,
        toNetwork,
        destinationAddress: "0x30a300612ab372cc73e53ffe87fb73d62ed68da3" // Also placeholder address
      });

      const routeResult = await getRoute(routeParams);
      const { route } = routeResult.data;
      const finalGrossOutputAmount = route.estimate.toAmount;
      const finalGrossOutputAmountDecimal = parseContractBalanceResponse(
        outputTokenDetails.decimals,
        BigInt(finalGrossOutputAmount)
      ).preciseBigDecimal;

      const feeToStore: QuoteFeeStructure = {
        anchor: "0",
        currency: targetFeeFiatCurrency,
        network: "0",
        partnerMarkup: "0",
        total: "0",
        vortex: "0"
      };

      const quote = await QuoteTicket.create({
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
        fee: feeToStore,
        from: request.from,
        id: uuidv4(),
        inputAmount: request.inputAmount,
        inputCurrency: request.inputCurrency,
        metadata: {} as QuoteTicketMetadata,
        outputAmount: finalGrossOutputAmountDecimal.toFixed(6, 0),
        outputCurrency: request.outputCurrency,
        partnerId: partner?.id || null,
        rampType: request.rampType,
        status: "pending",
        to: request.to
      });

      const responseFeeStructure: QuoteFeeStructure = {
        anchor: "0",
        currency: targetFeeFiatCurrency,
        network: "0",
        partnerMarkup: "0",
        total: "0",
        vortex: "0"
      };

      return {
        expiresAt: quote.expiresAt,
        fee: responseFeeStructure,
        from: quote.from,
        id: quote.id,
        inputAmount: trimTrailingZeros(quote.inputAmount),
        inputCurrency: quote.inputCurrency,
        outputAmount: trimTrailingZeros(finalGrossOutputAmountDecimal.toFixed(6, 0)),
        outputCurrency: quote.outputCurrency,
        rampType: quote.rampType,
        to: quote.to
      };
    }

    const nablaSwapResult =
      pr3Ctx?.nabla?.outputAmountDecimal && pr3Ctx?.nabla?.outputAmountRaw
        ? {
            effectiveExchangeRate: pr3Ctx.nabla.effectiveExchangeRate,
            nablaOutputAmountDecimal: pr3Ctx.nabla.outputAmountDecimal,
            nablaOutputAmountRaw: pr3Ctx.nabla.outputAmountRaw
          }
        : await calculateNablaSwapOutput({
            fromPolkadotDestination: request.from,
            inputAmountForSwap: (inputAmountForNablaSwap as Big).toString(),
            inputCurrency: request.inputCurrency,
            nablaOutputCurrency,
            rampType: request.rampType,
            toPolkadotDestination: request.to
          });

    if (request.rampType === RampDirection.SELL) {
      validateAmountLimits(
        nablaSwapResult.nablaOutputAmountDecimal,
        request.outputCurrency as FiatToken,
        "max",
        request.rampType
      );
    } else {
      validateAmountLimits(request.inputAmount, request.inputCurrency as FiatToken, "max", request.rampType);
    }

    // e. Calculate Full Fee Breakdown
    const outputAmountOfframp = nablaSwapResult.nablaOutputAmountDecimal.toString();

    // PR4: If FeeEngine already computed fees in ctx (via orchestrator for AssetHub on-ramp),
    // use those values; otherwise fall back to legacy calculation path.
    let vortexFeeFiat: string;
    let anchorFeeFiat: string;
    let partnerMarkupFeeFiat: string;
    let calculatedFeeCurrency: RampCurrency;

    // USD Fee Structure for metadata
    const usdCurrency = EvmToken.USDC;
    let vortexFeeUsd: string;
    let anchorFeeUsd: string;
    let partnerMarkupFeeUsd: string;

    if (pr3Ctx?.fees?.usd && pr3Ctx?.fees?.displayFiat?.structure) {
      const feesCtx = pr3Ctx.fees;
      vortexFeeFiat = feesCtx.displayFiat.structure.vortex;
      anchorFeeFiat = feesCtx.displayFiat.structure.anchor;
      partnerMarkupFeeFiat = feesCtx.displayFiat.structure.partnerMarkup;
      calculatedFeeCurrency = feesCtx.displayFiat.currency;

      vortexFeeUsd = feesCtx.usd.vortex;
      anchorFeeUsd = feesCtx.usd.anchor;
      partnerMarkupFeeUsd = feesCtx.usd.partnerMarkup;
    } else {
      const {
        vortexFee,
        anchorFee,
        partnerMarkupFee,
        feeCurrency: calcFeeCurrency
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

      calculatedFeeCurrency = calcFeeCurrency;

      // Convert other fees to targetFeeFiatCurrency if needed
      let vf = vortexFee;
      let af = anchorFee;
      let pmf = partnerMarkupFee;

      if (calculatedFeeCurrency !== targetFeeFiatCurrency) {
        vf = await priceFeedService.convertCurrency(vortexFee, calculatedFeeCurrency, targetFeeFiatCurrency);
        af = await priceFeedService.convertCurrency(anchorFee, calculatedFeeCurrency, targetFeeFiatCurrency);
        pmf = await priceFeedService.convertCurrency(partnerMarkupFee, calculatedFeeCurrency, targetFeeFiatCurrency);
      }

      vortexFeeFiat = vf;
      anchorFeeFiat = af;
      partnerMarkupFeeFiat = pmf;

      // Convert display fiat to USD for metadata
      vortexFeeUsd = await priceFeedService.convertCurrency(vortexFeeFiat, targetFeeFiatCurrency, usdCurrency);
      anchorFeeUsd = await priceFeedService.convertCurrency(anchorFeeFiat, targetFeeFiatCurrency, usdCurrency);
      partnerMarkupFeeUsd = await priceFeedService.convertCurrency(partnerMarkupFeeFiat, targetFeeFiatCurrency, usdCurrency);
    }
    // g. Handle EVM Bridge/Swap (If On-Ramp to EVM non-AssetHub)
    let squidRouterNetworkFeeUSD = "0";
    let finalGrossOutputAmountDecimal = nablaSwapResult.nablaOutputAmountDecimal;
    let outputAmountMoonbeamRaw = nablaSwapResult.nablaOutputAmountRaw;

    if (request.rampType === RampDirection.BUY) {
      const toNetwork = getNetworkFromDestination(request.to);
      if (!toNetwork) {
        throw new APIError({
          message: `Invalid network for destination: ${request.to} `,
          status: httpStatus.BAD_REQUEST
        });
      }

      const bridgeRequestParams: EvmBridgeRequest = {
        fromNetwork: Networks.Polygon,
        toNetwork,
        inputCurrency: request.inputCurrency,
        outputCurrency: request.outputCurrency,
        intermediateAmountRaw: nablaSwapResult.nablaOutputAmountRaw,
        originalInputAmountForRateCalc: inputAmountForNablaSwap.toString(),
        rampType: request.rampType
      };

      if (request.to === "assethub") {
        // Only the EURe -> axlUSDC swap on Moonbeam is relevant here.
        bridgeRequestParams.toNetwork = Networks.Moonbeam;
        bridgeRequestParams.outputCurrency = EvmToken.AXLUSDC;
      }

      // Do a first call to get a rough estimate of network fees
      const preliminaryResult = await calculateEvmBridgeAndNetworkFee(bridgeRequestParams);
      squidRouterNetworkFeeUSD = preliminaryResult.networkFeeUSD;

      // Deduct all the fees that are distributed after the Nabla swap and before the EVM bridge
      const outputAmountMoonbeamDecimal = new Big(nablaSwapResult.nablaOutputAmountDecimal)
        .minus(vortexFeeUsd)
        .minus(partnerMarkupFeeUsd)
        .minus(squidRouterNetworkFeeUSD);
      // axlUSDC on Moonbeam is 6 decimals
      outputAmountMoonbeamRaw = multiplyByPowerOfTen(outputAmountMoonbeamDecimal, 6).toString();

      bridgeRequestParams.intermediateAmountRaw = outputAmountMoonbeamRaw;

      // Do a second call with all fees deducted to get the final gross output amount
      const evmBridgeResult = await calculateEvmBridgeAndNetworkFee(bridgeRequestParams);

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

    if (request.rampType === RampDirection.BUY) {
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

    // This is the amount that will end up on Moonbeam just before doing the final step with the squidrouter transaction
    let onrampOutputAmountMoonbeamRaw = request.rampType === RampDirection.BUY ? outputAmountMoonbeamRaw : undefined;

    if (discountSubsidyPartner && discountSubsidyPartner.discount > 0) {
      // Calculate discount subsidy as percentage of finalNetOutputAmount. `discount` is a decimal (e.g., 0.05 for 5%)
      discountSubsidyAmount = finalNetOutputAmount.mul(discountSubsidyPartner.discount);

      // Add discount subsidy to finalNetOutputAmount (relevant for the subsidy of off-ramps)
      finalNetOutputAmount = finalNetOutputAmount.plus(discountSubsidyAmount);

      // Add subsidy to the output amount on Moonbeam (relevant for the subsidy of on-ramps)
      if (request.rampType === RampDirection.BUY) {
        const subsidyAmountRaw = multiplyByPowerOfTen(discountSubsidyAmount, 6).toString(); // axlUSDC on Moonbeam is 6 decimals
        onrampOutputAmountMoonbeamRaw = new Big(onrampOutputAmountMoonbeamRaw || "0").plus(subsidyAmountRaw).toFixed(0);
      }

      discountSubsidyInfo = {
        discount: discountSubsidyPartner.discount.toString(),
        partnerId: discountSubsidyPartner.id,
        subsidyAmountInOutputToken: discountSubsidyAmount.toFixed(6, 0)
      };
    }

    const finalNetOutputAmountStr =
      request.rampType === RampDirection.BUY ? finalNetOutputAmount.toFixed(6, 0) : finalNetOutputAmount.toFixed(2, 0);

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
