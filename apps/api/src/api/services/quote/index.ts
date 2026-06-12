import {
  AlfredpayTradeLimitError,
  CreateBestQuoteRequest,
  CreateQuoteRequest,
  DestinationType,
  FiatToken,
  getNetworkFromDestination,
  isNetworkEVM,
  Networks,
  QuoteError,
  QuoteResponse,
  RampDirection
} from "@vortexfi/shared";
import Big from "big.js";
import httpStatus from "http-status";
import pLimit from "p-limit";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import Partner from "../../../models/partner.model";
import { APIError } from "../../errors/api-error";
import { BaseRampService } from "../ramp/base.service";
import { createLowLiquidityQuoteError, isLowLiquidityQuoteError } from "./core/errors";
import { getTargetFiatCurrency, SUPPORTED_CHAINS, validateChainSupport } from "./core/helpers";
import { createQuoteContext } from "./core/quote-context";
import { QuoteOrchestrator } from "./core/quote-orchestrator";
import { buildQuoteResponse } from "./engines/finalize";
import { RouteResolver } from "./routes/route-resolver";

type BestQuoteFailure = {
  error: unknown;
  network: Networks;
};

export class QuoteService extends BaseRampService {
  public async createQuote(
    request: CreateQuoteRequest & { apiKey?: string | null; partnerName?: string | null; userId?: string }
  ): Promise<QuoteResponse> {
    return this.executeQuoteCalculation(request);
  }

  public async getQuote(id: string): Promise<QuoteResponse | null> {
    const quote = await this.getQuoteTicket(id);

    if (!quote) {
      return null;
    }

    if (quote.flowVariant !== config.flowVariant) {
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
    request: CreateBestQuoteRequest & { apiKey?: string | null; partnerName?: string | null; userId?: string }
  ): Promise<QuoteResponse> {
    const { rampType, from, to, networks } = request;

    // Determine eligible networks based on the corridor
    const allEligibleNetworks = this.getEligibleNetworks(rampType, from, to);

    // Apply optional client-provided whitelist (empty array is treated as "no whitelist")
    const eligibleNetworks =
      networks && networks.length > 0 ? allEligibleNetworks.filter(network => networks.includes(network)) : allEligibleNetworks;

    if (eligibleNetworks.length === 0) {
      const message =
        networks && networks.length > 0
          ? `No eligible networks found for ${rampType} from ${from} to ${to} within the requested networks: ${networks.join(", ")}`
          : `No eligible networks found for ${rampType} from ${from} to ${to}`;
      throw new APIError({
        message,
        status: httpStatus.BAD_REQUEST
      });
    }

    logger.info(`Fetching quotes for ${eligibleNetworks.length} networks: ${eligibleNetworks.join(", ")}`);

    // Use concurrency limit to prevent resource exhaustion when many networks are eligible
    const limit = pLimit(5); // Process up to 5 networks concurrently

    // Fetch quotes for all eligible networks with controlled parallelism (in-memory only)
    const quotePromises = eligibleNetworks.map(network =>
      limit(async () => {
        // Add a random delay to avoid rate limiting when many networks are queried
        const randomDelay = Math.floor(Math.random() * 2000);
        await new Promise(resolve => setTimeout(resolve, randomDelay));

        try {
          const quote = await this.executeQuoteCalculation(
            {
              ...request,
              // biome-ignore lint/style/noNonNullAssertion: Validated in getEligibleNetworks
              from: rampType === RampDirection.BUY ? request.from! : network,
              network,
              // biome-ignore lint/style/noNonNullAssertion: Validated in getEligibleNetworks
              to: rampType === RampDirection.BUY ? network : request.to!
            },
            true
          );
          return { network, quote };
        } catch (error) {
          logger.warn(`Failed to get quote for network ${network}: ${error instanceof Error ? error.message : String(error)}`);
          return { error, network };
        }
      })
    );

    const quoteResults = await Promise.all(quotePromises);
    const validQuotes = quoteResults.filter(
      (result): result is { network: Networks; quote: QuoteResponse } => "quote" in result
    );

    if (validQuotes.length === 0) {
      const failures = quoteResults.filter((result): result is BestQuoteFailure => "error" in result);
      if (failures.length > 0 && failures.every(failure => isLowLiquidityQuoteError(failure.error))) {
        throw createLowLiquidityQuoteError();
      }

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

    // Now save only the best quote to the database
    const savedQuote = await this.executeQuoteCalculation(
      { ...request, from: bestQuote.quote.from, network: bestQuote.network, to: bestQuote.quote.to },
      false
    );

    return savedQuote;
  }

  /**
   * Execute quote calculation logic
   * @param request - Quote request
   * @param skipPersistence - Whether to skip database persistence (for comparison)
   * @returns The calculated quote
   */
  private async executeQuoteCalculation(
    request: CreateQuoteRequest & { apiKey?: string | null; partnerName?: string | null; userId?: string },
    skipPersistence = false
  ): Promise<QuoteResponse> {
    validateChainSupport(request.rampType, request.from, request.to);

    if (request.rampType === RampDirection.BUY && request.to === Networks.Ethereum) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

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

    if (partner && partner.markupType !== "none" && partner.payoutAddressEvm === null && requiresEvmPartnerPayout(request)) {
      logger.error(
        `Quote rejected: partner '${partner.name}' (id=${partner.id}) has markup configured but no payout_address_evm; route ${request.from} -> ${request.to} (${request.outputCurrency}) requires EVM partner payout.`
      );
      throw new APIError({
        message: "Partner is missing EVM payout address required for this route",
        status: httpStatus.BAD_REQUEST
      });
    }

    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    const ctx = createQuoteContext({
      partner: partner
        ? {
            id: partner.id,
            maxDynamicDifference: partner.maxDynamicDifference,
            maxSubsidy: partner.maxSubsidy,
            minDynamicDifference: partner.minDynamicDifference,
            name: partner.name,
            targetDiscount: partner.targetDiscount
          }
        : { id: null },
      request: { ...request, apiKey: request.apiKey || undefined },
      targetFeeFiatCurrency
    });

    // Set skipPersistence flag in context
    if (skipPersistence) {
      ctx.skipPersistence = true;
    }

    const orchestrator = new QuoteOrchestrator();
    const resolver = new RouteResolver();
    const strategy = resolver.resolve(ctx);

    try {
      await orchestrator.run(strategy, ctx);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));

      // Preserve validation errors (BAD_REQUEST) - these are user-facing errors
      if (error instanceof APIError && error.status === httpStatus.BAD_REQUEST) {
        throw error;
      }

      if (isLowLiquidityQuoteError(error)) {
        throw createLowLiquidityQuoteError();
      }

      // Detect Alfredpay trade limit error and surface it as a user-facing limit error
      if (error instanceof AlfredpayTradeLimitError) {
        throw mapAlfredpayLimitErrorToApiError(error, ctx.request.rampType === RampDirection.BUY);
      }

      // Wrap unexpected errors as generic failure
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    if (!ctx.builtResponse) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.INTERNAL_SERVER_ERROR });
    }

    return ctx.builtResponse;
  }

  /**
   * Get eligible networks for a given corridor
   * @param rampType - Buy or Sell
   * @param from - Source destination
   * @param to - Target destination
   * @returns Array of eligible networks
   */
  private getEligibleNetworks(rampType: RampDirection, from?: DestinationType, to?: DestinationType): Networks[] {
    const supportedChains = SUPPORTED_CHAINS[rampType];

    if (rampType === RampDirection.BUY) {
      // Check if 'from' (payment method) is supported
      if (!from || !supportedChains.from.includes(from)) {
        return [];
      }
      // Return all supported 'to' networks that are actually Networks (not payment methods)
      return supportedChains.to.filter(dest => Object.values(Networks).includes(dest as Networks)) as Networks[];
    } else {
      // Check if 'to' (payment method) is supported
      if (!to || !supportedChains.to.includes(to)) {
        return [];
      }
      // Return all supported 'from' networks that are actually Networks
      return supportedChains.from.filter(dest => Object.values(Networks).includes(dest as Networks)) as Networks[];
    }
  }
}

function mapAlfredpayLimitErrorToApiError(error: AlfredpayTradeLimitError, isOnramp: boolean): APIError {
  const prefix = selectAlfredpayLimitPrefix(error.kind === "above", isOnramp);
  return new APIError({
    message: `${prefix} ${error.quantity} ${error.fromCurrency}`,
    status: httpStatus.BAD_REQUEST
  });
}

function selectAlfredpayLimitPrefix(isAboveMax: boolean, isOnramp: boolean): QuoteError {
  if (isAboveMax && isOnramp) return QuoteError.AboveUpperLimitBuy;
  if (isAboveMax) return QuoteError.AboveUpperLimitSell;
  if (isOnramp) return QuoteError.BelowLowerLimitBuy;
  return QuoteError.BelowLowerLimitSell;
}

function requiresEvmPartnerPayout(request: CreateQuoteRequest): boolean {
  if (request.rampType === RampDirection.SELL && request.outputCurrency === FiatToken.BRL) {
    const fromNetwork = getNetworkFromDestination(request.from);
    return fromNetwork !== undefined && isNetworkEVM(fromNetwork);
  }
  if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.BRL) {
    const toNetwork = getNetworkFromDestination(request.to);
    return toNetwork !== undefined && toNetwork !== Networks.AssetHub;
  }
  return false;
}

export default new QuoteService();
