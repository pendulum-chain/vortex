import { CreateQuoteRequest, DestinationType, Networks, QuoteError, QuoteResponse, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import logger from "../../../config/logger";
import Partner from "../../../models/partner.model";
import QuoteTicket from "../../../models/quoteTicket.model";
import { APIError } from "../../errors/api-error";
import { BaseRampService } from "../ramp/base.service";
import { getTargetFiatCurrency, SUPPORTED_CHAINS, validateChainSupport } from "./core/helpers";
import { createQuoteContext } from "./core/quote-context";
import { QuoteOrchestrator } from "./core/quote-orchestrator";
import { buildQuoteResponse } from "./engines/finalize";
import { RouteResolver } from "./routes/route-resolver";

export class QuoteService extends BaseRampService {
  public async createQuote(
    request: CreateQuoteRequest & { apiKey?: string | null; partnerName?: string | null }
  ): Promise<QuoteResponse> {
    return this.executeQuoteCalculation(request);
  }

  public async getQuote(id: string): Promise<QuoteResponse | null> {
    const quote = await this.getQuoteTicket(id);

    if (!quote) {
      return null;
    }

    return buildQuoteResponse(quote);
  }

  /**
   * Create a quote by querying all eligible networks and returning the best one
   * @param request - Quote request without network specification
   * @returns The best quote across all eligible networks
   */
  public async createBestQuote(
    request: Omit<CreateQuoteRequest, "network"> & { apiKey?: string | null; partnerName?: string | null }
  ): Promise<QuoteResponse> {
    const { rampType, from, to } = request;

    // Determine eligible networks based on the corridor
    const eligibleNetworks = this.getEligibleNetworks(rampType, from, to);

    if (eligibleNetworks.length === 0) {
      throw new APIError({
        message: `No eligible networks found for ${rampType} from ${from} to ${to}`,
        status: httpStatus.BAD_REQUEST
      });
    }

    logger.info(`Fetching quotes for ${eligibleNetworks.length} networks: ${eligibleNetworks.join(", ")}`);

    // Fetch quotes for all eligible networks in parallel
    const quotePromises = eligibleNetworks.map(async network => {
      try {
        const quote = await this.executeQuoteCalculation({ ...request, network });
        return { network, quote };
      } catch (error) {
        logger.warn(`Failed to get quote for network ${network}: ${error instanceof Error ? error.message : String(error)}`);
        return null;
      }
    });

    const quoteResults = await Promise.all(quotePromises);
    const validQuotes = quoteResults.filter((result): result is { network: Networks; quote: QuoteResponse } => result !== null);

    if (validQuotes.length === 0) {
      throw new APIError({
        message: QuoteError.FailedToCalculateQuote,
        status: httpStatus.INTERNAL_SERVER_ERROR
      });
    }

    // Find the best quote (highest output amount)
    const bestQuote = validQuotes.reduce((best, current) => {
      const currentOutput = new Big(current.quote.outputAmount);
      const bestOutput = new Big(best.quote.outputAmount);
      return currentOutput.gt(bestOutput) ? current : best;
    });

    logger.info(
      `Best quote found on network ${bestQuote.network} with output amount ${bestQuote.quote.outputAmount}. Considered ${validQuotes.length} networks.`
    );

    // Delete all non-winning quote records from database
    const quoteIdsToDelete = validQuotes.filter(q => q.quote.id !== bestQuote.quote.id).map(q => q.quote.id);

    if (quoteIdsToDelete.length > 0) {
      await QuoteTicket.destroy({ where: { id: quoteIdsToDelete } });
      logger.info(`Deleted ${quoteIdsToDelete.length} non-winning quote(s) from database`);
    }

    return bestQuote.quote;
  }

  /**
   * Execute quote calculation logic and save to database
   * @param request - Quote request
   * @returns The calculated and persisted quote
   */
  private async executeQuoteCalculation(
    request: CreateQuoteRequest & { apiKey?: string | null; partnerName?: string | null }
  ): Promise<QuoteResponse> {
    validateChainSupport(request.rampType, request.from, request.to);

    let partner = null;
    const partnerNameToUse = request.partnerId || request.partnerName;

    if (partnerNameToUse) {
      partner = await Partner.findOne({
        where: {
          isActive: true,
          name: partnerNameToUse,
          rampType: request.rampType
        }
      });

      if (!partner) {
        logger.warn(`Partner with name '${partnerNameToUse}' not found or not active. Proceeding with default fees.`);
      }
    }

    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    const ctx = createQuoteContext({
      partner: partner ? { discount: partner.discount, id: partner.id, name: partner.name } : { id: null },
      request: { ...request, apiKey: request.apiKey || undefined },
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

    if (!ctx.builtResponse) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    // If persist is false, we return a temporary quote response without saving
    // The orchestrator already saved it, so we need a different approach
    return ctx.builtResponse;
  }

  /**
   * Get eligible networks for a given corridor
   * @param rampType - Buy or Sell
   * @param from - Source destination
   * @param to - Target destination
   * @returns Array of eligible networks
   */
  private getEligibleNetworks(rampType: RampDirection, from: DestinationType, to: DestinationType): Networks[] {
    const supportedChains = SUPPORTED_CHAINS[rampType];

    // For onramps (BUY): 'to' can be one of the supported networks
    // For offramps (SELL): 'from' can be one of the supported networks
    if (rampType === RampDirection.BUY) {
      // Check if 'from' (payment method) is supported
      if (!supportedChains.from.includes(from)) {
        return [];
      }
      // Return all supported 'to' networks that are actually Networks (not payment methods)
      return supportedChains.to.filter(dest => Object.values(Networks).includes(dest as Networks)) as Networks[];
    } else {
      // SELL (offramp)
      // Check if 'to' (payment method) is supported
      if (!supportedChains.to.includes(to)) {
        return [];
      }
      // Return all supported 'from' networks that are actually Networks
      return supportedChains.from.filter(dest => Object.values(Networks).includes(dest as Networks)) as Networks[];
    }
  }
}

export default new QuoteService();
