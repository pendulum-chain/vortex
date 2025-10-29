import { getPaymentMethodFromDestinations, QuoteResponse, RampDirection } from "@packages/shared";
import Big from "big.js";
import httpStatus from "http-status";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { trimTrailingZeros } from "../../core/helpers";
import { QuoteContext, Stage, StageKey } from "../../core/types";

export interface FinalizeStageConfig {
  direction: RampDirection;
  skipNote: string;
  missingFeesMessage: string;
}

export interface FinalizeComputation {
  amount: Big;
  decimals: number;
}

export function buildQuoteResponse(quoteTicket: QuoteTicket): QuoteResponse {
  const usdFees = quoteTicket.metadata.fees?.usd;
  const fiatFees = quoteTicket.metadata.fees?.displayFiat;

  if (!usdFees || !fiatFees) {
    throw new APIError({ message: "Missing fee information in quote record", status: httpStatus.INTERNAL_SERVER_ERROR });
  }

  // Calculate processing fees
  const processingFeeFiat = new Big(fiatFees.anchor).plus(fiatFees.vortex).toFixed();
  const processingFeeUsd = new Big(usdFees.anchor).plus(usdFees.vortex).toFixed();

  return {
    anchorFeeFiat: fiatFees.anchor,
    anchorFeeUsd: usdFees.anchor,
    expiresAt: quoteTicket.expiresAt,
    feeCurrency: fiatFees.currency,
    from: quoteTicket.from,
    id: quoteTicket.id,
    inputAmount: trimTrailingZeros(quoteTicket.inputAmount),
    inputCurrency: quoteTicket.inputCurrency,
    networkFeeFiat: fiatFees.network,
    networkFeeUsd: usdFees.network,
    outputAmount: trimTrailingZeros(quoteTicket.outputAmount),
    outputCurrency: quoteTicket.outputCurrency,
    partnerFeeFiat: fiatFees.partnerMarkup,
    partnerFeeUsd: usdFees.partnerMarkup,
    paymentMethod: quoteTicket.paymentMethod,
    processingFeeFiat,
    processingFeeUsd,
    rampType: quoteTicket.rampType,
    to: quoteTicket.to,
    totalFeeFiat: fiatFees.total,
    totalFeeUsd: usdFees.total,
    vortexFeeFiat: fiatFees.vortex,
    vortexFeeUsd: usdFees.vortex
  };
}

export abstract class BaseFinalizeEngine implements Stage {
  abstract readonly config: FinalizeStageConfig;

  readonly key = StageKey.Finalize;

  async execute(ctx: QuoteContext): Promise<void> {
    const { request } = ctx;
    const { direction, skipNote, missingFeesMessage } = this.config;

    if (request.rampType !== direction) {
      ctx.addNote?.(skipNote);
      return;
    }

    if (!ctx.fees?.displayFiat) {
      throw new APIError({ message: missingFeesMessage, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    const computation = await this.computeOutput(ctx);
    this.validate(ctx, computation);

    const outputAmountStr = computation.amount.toFixed(computation.decimals, 0);

    const paymentMethod = getPaymentMethodFromDestinations(request.from, request.to);

    const record = await QuoteTicket.create({
      apiKey: request.apiKey || null,
      countryCode: request.countryCode,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      fee: ctx.fees.displayFiat,
      from: request.from,
      inputAmount: request.inputAmount,
      inputCurrency: request.inputCurrency,
      metadata: ctx,
      network: request.network,
      outputAmount: outputAmountStr,
      outputCurrency: request.outputCurrency,
      partnerId: ctx.partner?.id || null,
      paymentMethod,
      rampType: request.rampType,
      status: "pending",
      to: request.to
    });

    ctx.builtResponse = buildQuoteResponse(record);

    ctx.addNote?.("Persisted quote and built response");
  }

  protected abstract computeOutput(ctx: QuoteContext): Promise<FinalizeComputation>;

  protected validate(ctx: QuoteContext, result: FinalizeComputation): void {
    // Implemented by subclasses when necessary
  }
}
