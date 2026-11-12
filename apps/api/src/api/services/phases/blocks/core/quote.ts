import {
  EvmToken,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPaymentMethodFromDestinations,
  OnChainToken,
  type ProviderCost,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import type { QuoteContext, QuoteTicketMetadata } from "../../../quote/core/types";
import { resolveBlockFlow } from "../flows/catalog";
import type { NablaSwapMetadata } from "../phases/nabla-swap/simulation";
import type { StockPermitSourceMetadata } from "../phases/stock-permit-source/simulation";
import type { StockRouteMetadata } from "../phases/stock-route/simulation";
import { trimTrailingZeros } from "./helpers";
import type { FlowMetadata } from "./metadata";
import { buildBlockQuoteResponse, stockQuoteResponseFields } from "./quote-response";
import { isBaseUsdcRobinhoodRoute } from "./robinhood-stocks";
import type { PhaseCtx, PhaseIO } from "./types";
import { applyAlfredpayLimits, assertEvmPartnerPayoutPresent, validateAmountLimits } from "./validation";

async function validateOutput(ctx: QuoteContext, output: PhaseIO): Promise<number> {
  if (output.amount.lte(0)) {
    throw new APIError({ message: "Input amount too low to cover calculated fees", status: httpStatus.BAD_REQUEST });
  }
  if (isBaseUsdcRobinhoodRoute(ctx.request)) {
    const amount = ctx.request.rampType === RampDirection.BUY ? new Big(ctx.request.inputAmount) : output.amount;
    if (amount.lt(10) || amount.gt(1_000_000))
      throw new APIError({ message: "USDC amount must be between 10 and 1000000", status: 400 });
    if (ctx.request.rampType === RampDirection.BUY && !amount.round(6, Big.roundDown).eq(amount)) {
      throw new APIError({ message: "USDC input has more than 6 decimal places", status: 400 });
    }
    return ctx.request.rampType === RampDirection.BUY ? getOutputDecimals(ctx) : 6;
  }
  if (await applyAlfredpayLimits(ctx, ctx.request.inputAmount)) {
    return ctx.request.rampType === RampDirection.SELL ? 2 : getOutputDecimals(ctx);
  }
  if (ctx.request.rampType === RampDirection.BUY) {
    validateAmountLimits(ctx.request.inputAmount, ctx.request.inputCurrency as FiatToken, "min", ctx.request.rampType);
    validateAmountLimits(ctx.request.inputAmount, ctx.request.inputCurrency as FiatToken, "max", ctx.request.rampType);
    return getOutputDecimals(ctx);
  }
  validateAmountLimits(output.amount, ctx.request.outputCurrency as FiatToken, "min", ctx.request.rampType);
  validateAmountLimits(output.amount, ctx.request.outputCurrency as FiatToken, "max", ctx.request.rampType);
  return 2;
}

function getOutputDecimals(ctx: QuoteContext): number {
  const network = getNetworkFromDestination(ctx.request.to);
  const token = network && getOnChainTokenDetails(network, ctx.request.outputCurrency as OnChainToken);
  if (!token) {
    throw new APIError({ message: "Block flow output token is not configured", status: httpStatus.INTERNAL_SERVER_ERROR });
  }
  return token.decimals;
}

async function assignSubsidyDisplay(metadata: FlowMetadata, ctx: QuoteContext): Promise<void> {
  const subsidy = (metadata.blocks.subsidizePostSwap ?? metadata.blocks.subsidizePreSwap) as
    | { applied?: boolean; outputCurrency?: RampCurrency; subsidyAmountInOutputTokenDecimal?: Big | string }
    | undefined;
  if (!subsidy?.applied || !subsidy.outputCurrency || new Big(subsidy.subsidyAmountInOutputTokenDecimal ?? 0).lte(0)) {
    return;
  }

  const amount = new Big(subsidy.subsidyAmountInOutputTokenDecimal ?? 0).toString();
  const displayCurrency =
    metadata.blocks.nablaSwap && subsidy.outputCurrency === EvmToken.BRLA ? FiatToken.BRL : subsidy.outputCurrency;
  const [fiat, usd] = await Promise.all([
    priceFeedService.convertCurrencyOrNull(amount, displayCurrency, ctx.targetFeeFiatCurrency),
    priceFeedService.convertCurrencyOrNull(amount, displayCurrency, EvmToken.USDC as RampCurrency)
  ]);
  if (fiat && usd) {
    metadata.globals.subsidyDisplay = {
      currency: ctx.targetFeeFiatCurrency,
      fiat: new Big(fiat).toFixed(2),
      usd: new Big(usd).toFixed(6)
    };
  }
}

function toCents(amount: Big): string {
  const cents = amount.toFixed(2);
  return cents === "-0.00" ? "0.00" : cents;
}

/**
 * The stock flows' route facts. `fees` rows partition the total fee without the gas reserve. `rate` rows are
 * signed effects already inside the output amount: conversion and bridge against their input, swap against the
 * Chainlink reference.
 */
async function assignStockQuoteFields(metadata: FlowMetadata, ctx: QuoteContext): Promise<void> {
  const route = metadata.blocks.stockRoute as StockRouteMetadata | undefined;
  const fiatFees = metadata.globals.fees.displayFiat;
  if (!route || !fiatFees) return;

  const fiatPerUsd = new Big(
    fiatFees.currency === EvmToken.USDC ? 1 : await priceFeedService.getUsdToFiatExchangeRate(fiatFees.currency)
  );
  const nabla = metadata.blocks.nablaSwap as NablaSwapMetadata;
  const nablaInput = new Big(nabla?.inputAmountForSwapDecimal ?? 0);
  const rebate = nabla?.feeSubsidy
    ? new Big(nabla.feeSubsidy.rebateRaw).div(new Big(10).pow(nabla.feeSubsidy.outputDecimals))
    : new Big(0);
  const nablaOutput = new Big(nabla?.outputAmountDecimal ?? 0).plus(rebate);
  const conversionFiat =
    ctx.request.rampType === RampDirection.BUY
      ? nablaInput.minus(nablaOutput.mul(fiatPerUsd))
      : nablaInput.mul(fiatPerUsd).minus(nablaOutput);

  const row = (
    id: ProviderCost["id"],
    provider: ProviderCost["provider"],
    includedIn: ProviderCost["includedIn"],
    fiat: Big
  ) => ({
    amountFiat: fiatFees.currency === EvmToken.USDC ? fiat.toFixed(6) : toCents(fiat),
    id,
    includedIn,
    provider
  });
  metadata.globals.providerCosts = [
    row("ramp", "avenia", "fees", new Big(fiatFees.anchor)),
    row("conversion", "nabla", "rate", conversionFiat),
    row("bridge", "relay", "rate", new Big(route.bridge.costUsd).mul(fiatPerUsd)),
    row("swap", "uniswap", "rate", new Big(route.swap.costUsd).mul(fiatPerUsd)),
    row("vortex", "vortex", "fees", new Big(fiatFees.vortex)),
    row("network", "network", "fees", new Big(fiatFees.network).minus(metadata.globals.gasReserve?.fiat ?? 0))
  ];
  metadata.globals.routingStrategy = "direct";
  if (nabla?.feeSubsidy) {
    const fee = nabla.feeSubsidy;
    // BRLA redemption is denominated in BRL; use the same FX reference as the conversion row.
    const fiat = fee.outputCurrency === EvmToken.BRLA ? rebate : rebate.mul(fiatPerUsd);
    const usd = fee.outputCurrency === EvmToken.BRLA ? rebate.div(fiatPerUsd) : rebate;
    metadata.globals.nablaFeeSubsidy = {
      amountFiat: new Big(fiat).toFixed(2),
      amountUsd: new Big(usd).toFixed(6),
      chargedFeeBps: new Big(fee.chargedFeeRaw).div(fee.grossOutputRaw).mul(10000).toFixed(4),
      currency: fiatFees.currency,
      effectiveFeeBps: new Big(fee.targetFeeRaw).div(fee.grossOutputRaw).mul(10000).toFixed(4)
    };
  }

  const permitSource = metadata.blocks.stockPermitSource as StockPermitSourceMetadata | undefined;
  if (permitSource) metadata.globals.gasless = permitSource.gasless;
}

function buildTemporaryResponse(ctx: QuoteContext, metadata: FlowMetadata, outputAmount: string, expiresAt: Date) {
  const fiatFees = metadata.globals.fees.displayFiat;
  if (!fiatFees) {
    throw new Error("Block flow did not compute display fees");
  }
  const paymentMethod = getPaymentMethodFromDestinations(ctx.request.from, ctx.request.to);
  return {
    anchorFeeFiat: fiatFees.anchor,
    anchorFeeUsd: metadata.globals.fees.usd.anchor,
    createdAt: new Date(),
    expiresAt,
    feeCurrency: fiatFees.currency,
    from: ctx.request.from,
    id: `temp-${Date.now()}`,
    inputAmount: trimTrailingZeros(ctx.request.inputAmount),
    inputCurrency: ctx.request.inputCurrency,
    network: ctx.request.network,
    networkFeeFiat: fiatFees.network,
    networkFeeUsd: metadata.globals.fees.usd.network,
    outputAmount: trimTrailingZeros(outputAmount),
    outputCurrency: ctx.request.outputCurrency,
    partnerFeeFiat: fiatFees.partnerMarkup,
    partnerFeeUsd: metadata.globals.fees.usd.partnerMarkup,
    paymentMethod,
    processingFeeFiat: new Big(fiatFees.anchor).plus(fiatFees.vortex).toFixed(),
    processingFeeUsd: new Big(metadata.globals.fees.usd.anchor).plus(metadata.globals.fees.usd.vortex).toFixed(),
    rampType: ctx.request.rampType,
    ...(metadata.globals.subsidyDisplay
      ? {
          discountCurrency: metadata.globals.subsidyDisplay.currency,
          discountFiat: metadata.globals.subsidyDisplay.fiat,
          discountUsd: metadata.globals.subsidyDisplay.usd
        }
      : {}),
    ...stockQuoteResponseFields(metadata.globals),
    to: ctx.request.to,
    totalFeeFiat: fiatFees.total,
    totalFeeUsd: metadata.globals.fees.usd.total,
    vortexFeeFiat: fiatFees.vortex,
    vortexFeeUsd: metadata.globals.fees.usd.vortex
  };
}

export function resolveBlockQuoteExpiry(providerExpiresAt: Date | undefined, now = new Date()): Date {
  return providerExpiresAt ?? new Date(now.getTime() + 10 * 60 * 1000);
}

export async function runBlockQuoteFlow(ctx: QuoteContext): Promise<void> {
  const phaseCtx: PhaseCtx = {
    addNote: note => ctx.addNote?.(note),
    notes: ctx.notes ?? [],
    now: ctx.now,
    partner: ctx.partner,
    request: ctx.request,
    targetFeeFiatCurrency: ctx.targetFeeFiatCurrency
  };
  const { expiresAt: providerExpiresAt, metadata, output } = await resolveBlockFlow(ctx.request).simulate(phaseCtx);
  const decimals = await validateOutput(ctx, output);
  const outputAmount = output.amount.toFixed(decimals, 0);
  const expiresAt = resolveBlockQuoteExpiry(providerExpiresAt);
  await assignSubsidyDisplay(metadata, ctx);
  await assignStockQuoteFields(metadata, ctx);
  ctx.fees = phaseCtx.fees;
  assertEvmPartnerPayoutPresent(ctx);

  if (ctx.skipPersistence) {
    ctx.builtResponse = buildTemporaryResponse(ctx, metadata, outputAmount, expiresAt);
    return;
  }

  const record = await QuoteTicket.create({
    apiCredentialId: ctx.request.apiCredentialId || null,
    apiKey: ctx.request.apiKey || null,
    countryCode: ctx.request.countryCode,
    expiresAt,
    flowVariant: config.flowVariant,
    from: ctx.request.from,
    inputAmount: ctx.request.inputAmount,
    inputCurrency: ctx.request.inputCurrency,
    metadata: metadata as unknown as QuoteTicketMetadata,
    network: ctx.request.network,
    outputAmount,
    outputCurrency: ctx.request.outputCurrency,
    partnerId: ctx.partnerOwnerId || null,
    paymentMethod: getPaymentMethodFromDestinations(ctx.request.from, ctx.request.to),
    pricingPartnerId: ctx.pricingPartnerId || null,
    rampType: ctx.request.rampType,
    status: "pending",
    to: ctx.request.to,
    userId: ctx.request.userId || null
  });
  ctx.builtResponse = buildBlockQuoteResponse(record);
}
