import { CreateQuoteRequest, FiatToken, QuoteError, QuoteFeeStructure, QuoteResponse, RampDirection } from "@packages/shared";
import httpStatus from "http-status";
import logger from "../../../../config/logger";
import Partner from "../../../../models/partner.model";
import { APIError } from "../../../errors/api-error";
import { BaseRampService } from "../base.service";
import { createQuoteContext } from "./core/quote-context";
import { buildDefaultEnginesRegistry, buildEnginesRegistry, QuoteOrchestrator } from "./core/quote-orchestrator";
import { BridgeEngine } from "./engines/bridge-engine";
import { DiscountEngine } from "./engines/discount-engine";
import { FeeEngine } from "./engines/fee-engine";
import { FinalizeEngine } from "./engines/finalize-engine";
import { InputPlannerEngine } from "./engines/input-planner";
import { SpecialOnrampEurEvmEngine } from "./engines/special-onramp-eur-evm";
import { SwapEngine } from "./engines/swap-engine";
import { getTargetFiatCurrency, trimTrailingZeros, validateChainSupport } from "./helpers";
import { RouteResolver } from "./routes/route-resolver";
import { StageKey } from "./types";

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

    if (request.rampType === RampDirection.BUY) {
      //validateAmountLimits(request.inputAmount, request.inputCurrency as FiatToken, "max", request.rampType);
    }

    // Determine the target fiat currency for fees
    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    // Special case: EUR on-ramp to EVM (non-AssetHub)
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

    // On-ramp to AssetHub
    if (request.rampType === RampDirection.BUY && request.to === "assethub") {
      const resolver = new RouteResolver();
      const engines = buildDefaultEnginesRegistry();
      const orchestrator = new QuoteOrchestrator(engines);

      const ctx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(ctx);
      await orchestrator.run(strategy, ctx);

      if (!ctx.builtResponse) {
        throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
      }
      return ctx.builtResponse;
    }

    // On-ramp to EVM (non-EUR)
    if (request.rampType === RampDirection.BUY && request.to !== "assethub" && request.inputCurrency !== FiatToken.EURC) {
      const resolver = new RouteResolver();
      const engines = buildDefaultEnginesRegistry();
      const orchestrator = new QuoteOrchestrator(engines);

      const ctx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(ctx);
      await orchestrator.run(strategy, ctx);

      // If FinalizeEngine built a response, return it now to avoid legacy duplication
      if (ctx.builtResponse) {
        return ctx.builtResponse;
      }
    }

    // If we reach here with a BUY request, treat as failure to compute via pipeline.
    if (request.rampType === RampDirection.BUY) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    if (request.rampType === RampDirection.SELL) {
      const resolver = new RouteResolver();
      const engines = buildDefaultEnginesRegistry();
      const orchestrator = new QuoteOrchestrator(engines);

      const ctx = createQuoteContext({
        partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
        request,
        targetFeeFiatCurrency
      });

      const strategy = resolver.resolve(ctx);
      await orchestrator.run(strategy, ctx);

      if (!ctx.builtResponse) {
        throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
      }
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
