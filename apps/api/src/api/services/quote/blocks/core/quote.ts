import {
  EvmToken,
  FiatToken,
  getNetworkFromDestination,
  getOnChainTokenDetails,
  getPaymentMethodFromDestinations,
  OnChainToken,
  RampCurrency,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import { config } from "../../../../../config/vars";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { priceFeedService } from "../../../priceFeed.service";
import { trimTrailingZeros } from "../../core/helpers";
import type { QuoteContext, QuoteTicketMetadata } from "../../core/types";
import { applyAlfredpayLimits, validateAmountLimits } from "../../core/validation-helpers";
import { resolveBlockFlow } from "../flows/catalog";
import type { FlowMetadata } from "./metadata";
import { buildBlockQuoteResponse } from "./quote-response";
import type { PhaseCtx, PhaseIO } from "./types";

async function validateOutput(ctx: QuoteContext, output: PhaseIO): Promise<number> {
  if (output.amount.lte(0)) {
    throw new APIError({ message: "Input amount too low to cover calculated fees", status: httpStatus.BAD_REQUEST });
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
  const [fiat, usd] = await Promise.all([
    priceFeedService.convertCurrencyOrNull(amount, subsidy.outputCurrency, ctx.targetFeeFiatCurrency),
    priceFeedService.convertCurrencyOrNull(amount, subsidy.outputCurrency, EvmToken.USDC as RampCurrency)
  ]);
  if (fiat && usd) {
    metadata.globals.subsidyDisplay = {
      currency: ctx.targetFeeFiatCurrency,
      fiat: new Big(fiat).toFixed(2),
      usd: new Big(usd).toFixed(6)
    };
  }
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
  ctx.fees = phaseCtx.fees;

  if (ctx.skipPersistence) {
    ctx.builtResponse = buildTemporaryResponse(ctx, metadata, outputAmount, expiresAt);
    return;
  }

  const record = await QuoteTicket.create({
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
