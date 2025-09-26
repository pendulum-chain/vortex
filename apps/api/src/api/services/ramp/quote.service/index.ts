import { CreateQuoteRequest, QuoteError, QuoteFeeStructure, QuoteResponse } from "@packages/shared";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import { APIError } from "../../../errors/api-error";
import { BaseRampService } from "../base.service";
import { getTargetFiatCurrency, trimTrailingZeros, validateChainSupport } from "./core/helpers";
import { createQuoteContext } from "./core/quote-context";
import { QuoteOrchestrator } from "./core/quote-orchestrator";
import { RouteResolver } from "./routes/route-resolver";

export class QuoteService extends BaseRampService {
  public async createQuote(request: CreateQuoteRequest): Promise<QuoteResponse> {
    validateChainSupport(request.rampType, request.from, request.to);

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

    // Determine the target fiat currency for fees
    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    const ctx = createQuoteContext({
      partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
      request,
      targetFeeFiatCurrency
    });

    const orchestrator = new QuoteOrchestrator();
    const resolver = new RouteResolver();
    const strategy = resolver.resolve(ctx);
    await orchestrator.run(strategy, ctx);

    console.log("Quote context", ctx);

    if (ctx.builtResponse) {
      return ctx.builtResponse;
    }

    // Unreachable: all BUY and SELL routes are handled above via the pipeline strategies.
    throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
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
