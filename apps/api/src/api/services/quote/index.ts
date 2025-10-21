import { CreateQuoteRequest, QuoteError, QuoteResponse } from "@packages/shared";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import { APIError } from "../../errors/api-error";
import { BaseRampService } from "../ramp/base.service";
import { getTargetFiatCurrency, validateChainSupport } from "./core/helpers";
import { createQuoteContext } from "./core/quote-context";
import { QuoteOrchestrator } from "./core/quote-orchestrator";
import { buildQuoteResponse } from "./engines/finalize";
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
    try {
      await orchestrator.run(strategy, ctx);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

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

    return buildQuoteResponse(quote);
  }
}

export default new QuoteService();
