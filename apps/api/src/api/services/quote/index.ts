import {
  AlfredpayTradeLimitError,
  CreateBestQuoteRequest,
  CreateQuoteRequest,
  DestinationType,
  doesNetworkSupportEurOnramp,
  EvmToken,
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
import { APIError } from "../../errors/api-error";
import {
  getTargetFiatCurrency,
  isRetiredAssetHubCorridor,
  SUPPORTED_CHAINS,
  validateChainSupport
} from "../phases/blocks/core/helpers";
import { runBlockQuoteFlow } from "../phases/blocks/core/quote";
import { buildBlockQuoteResponse } from "../phases/blocks/core/quote-response";
import {
  assertStockTradable,
  isBrlPixRobinhoodRoute,
  isRobinhoodRoute,
  isStockQuoteUnavailableError,
  isStockSymbol,
  STOCK_TOKEN_DECIMALS
} from "../phases/blocks/core/robinhood-stocks";
import { BaseRampService } from "../ramp/base.service";
import { createLowLiquidityQuoteError, isLowLiquidityQuoteError } from "./core/errors";
import { resolveQuotePartner } from "./core/partner-resolution";
import { createQuoteContext } from "./core/quote-context";

type BestQuoteFailure = {
  error: unknown;
  network: Networks;
};

function isNetworkFeesTooHighError(error: unknown): error is APIError {
  return (
    error instanceof APIError &&
    error.status === httpStatus.SERVICE_UNAVAILABLE &&
    error.message === QuoteError.NetworkFeesTooHigh
  );
}

export class QuoteService extends BaseRampService {
  public async createQuote(
    request: CreateQuoteRequest & {
      apiCredentialId?: string;
      apiKey?: string | null;
      controllingManagerProfileId?: string;
      userId?: string;
    }
  ): Promise<QuoteResponse> {
    assertEurOfframpSupported(request);
    assertEurOnrampEnabled(request);
    assertFiatCurrencyEnabled(request);
    assertEurOnrampNetworkSupported(request);
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

    return buildBlockQuoteResponse(quote);
  }

  /**
   * Create a quote by querying all eligible networks and returning the best one
   * @param request - Quote request without network specification
   * @returns The best quote across all eligible networks
   */
  public async createBestQuote(
    request: CreateBestQuoteRequest & {
      apiCredentialId?: string;
      apiKey?: string | null;
      controllingManagerProfileId?: string;
      userId?: string;
    }
  ): Promise<QuoteResponse> {
    assertEurOfframpSupported(request);
    assertEurOnrampEnabled(request);
    assertFiatCurrencyEnabled(request);
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
      if (failures.length > 0 && failures.every(failure => isNetworkFeesTooHighError(failure.error))) {
        throw new APIError({ message: QuoteError.NetworkFeesTooHigh, status: httpStatus.SERVICE_UNAVAILABLE });
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
    request: CreateQuoteRequest & {
      apiCredentialId?: string;
      apiKey?: string | null;
      controllingManagerProfileId?: string;
      userId?: string;
    },
    skipPersistence = false
  ): Promise<QuoteResponse> {
    validateChainSupport(request.rampType, request.from, request.to);

    if (isRetiredAssetHubCorridor(request)) {
      throw new APIError({ message: QuoteError.FailedToCalculateQuote, status: httpStatus.BAD_REQUEST });
    }

    await assertStockRouteQuotable(request);

    const resolvedPartner = await resolveQuotePartner(request);
    const partner = resolvedPartner.partner;

    const targetFeeFiatCurrency = getTargetFiatCurrency(request.rampType, request.inputCurrency, request.outputCurrency);

    const ctx = createQuoteContext({
      partner: partner
        ? {
            id: partner.id,
            maxDynamicDifference: partner.maxDynamicDifference,
            maxSubsidy: partner.maxSubsidy,
            minDynamicDifference: partner.minDynamicDifference,
            name: partner.name,
            payoutAddressEvm: partner.payoutAddressEvm,
            targetDiscount: partner.targetDiscount
          }
        : { id: null },
      partnerOwnerId: resolvedPartner.ownerPartnerId,
      partnerPricingSource: resolvedPartner.source,
      pricingPartnerId: resolvedPartner.pricingPartnerId,
      request: { ...request, apiKey: request.apiKey || undefined },
      targetFeeFiatCurrency
    });

    // Set skipPersistence flag in context
    if (skipPersistence) {
      ctx.skipPersistence = true;
    }

    try {
      await runBlockQuoteFlow(ctx);
    } catch (error) {
      logger.error(error instanceof Error ? error.message : String(error));

      // Preserve validation errors (BAD_REQUEST) - these are user-facing errors
      if (error instanceof APIError && error.status === httpStatus.BAD_REQUEST) {
        throw error;
      }

      if (isNetworkFeesTooHighError(error) || isStockQuoteUnavailableError(error)) {
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
      return supportedChains.to.filter(isBestQuoteNetwork) as Networks[];
    } else {
      // Check if 'to' (payment method) is supported
      if (!to || !supportedChains.to.includes(to)) {
        return [];
      }
      // Return all supported 'from' networks that are actually Networks
      return supportedChains.from.filter(isBestQuoteNetwork) as Networks[];
    }
  }
}

/** Stock tokens are identified per network, so Robinhood Chain never competes in a best-quote comparison. */
function isBestQuoteNetwork(destination: DestinationType): boolean {
  return destination !== Networks.Robinhood && Object.values(Networks).includes(destination as Networks);
}

function assertEurOfframpSupported(request: Pick<CreateQuoteRequest, "outputCurrency" | "rampType">): void {
  if (request.rampType === RampDirection.SELL && request.outputCurrency === FiatToken.EURC) {
    throw new APIError({
      isPublic: true,
      message: "EUR offramps are not supported",
      status: httpStatus.BAD_REQUEST
    });
  }
}

/** Operational kill switch (`EUR_ONRAMP_ENABLED=false`): new EUR pay-in quotes stop, registered ramps keep executing. */
function assertEurOnrampEnabled(request: Pick<CreateQuoteRequest, "inputCurrency" | "rampType">): void {
  if (request.rampType === RampDirection.BUY && request.inputCurrency === FiatToken.EURC && !config.monerium.eurOnrampEnabled) {
    throw new APIError({
      isPublic: true,
      message: QuoteError.AnchorTemporarilyUnavailable,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
}

/** Operational kill switch (`DISABLED_FIAT_CURRENCIES=MXN,COP`): new quotes on those fiat rails stop, registered ramps keep executing. */
function assertFiatCurrencyEnabled(request: Pick<CreateQuoteRequest, "inputCurrency" | "outputCurrency" | "rampType">): void {
  const fiatCurrency = request.rampType === RampDirection.BUY ? request.inputCurrency : request.outputCurrency;
  if (config.quote.disabledFiatCurrencies.includes(fiatCurrency as FiatToken)) {
    throw new APIError({
      isPublic: true,
      message: QuoteError.AnchorTemporarilyUnavailable,
      status: httpStatus.SERVICE_UNAVAILABLE
    });
  }
}

/**
 * Best-quote aggregation skips unsupported networks on its own; only a direct quote needs the
 * public rejection so clients can tell an unsupported destination from a pricing failure.
 */
function assertEurOnrampNetworkSupported(request: Pick<CreateQuoteRequest, "inputCurrency" | "rampType" | "to">): void {
  const network = getNetworkFromDestination(request.to);
  if (
    request.rampType === RampDirection.BUY &&
    request.inputCurrency === FiatToken.EURC &&
    network !== undefined &&
    !doesNetworkSupportEurOnramp(network)
  ) {
    throw new APIError({ isPublic: true, message: QuoteError.EurOnrampNetworkUnsupported, status: httpStatus.BAD_REQUEST });
  }
}

/**
 * Robinhood Chain routes only: the per-direction switch, then the allowlist and issuer pause of the
 * one corridor it serves. Anything but BRL via Pix falls through to the catalog's own rejection.
 */
async function assertStockRouteQuotable(
  request: Pick<CreateQuoteRequest, "from" | "inputAmount" | "inputCurrency" | "outputCurrency" | "rampType" | "to">
): Promise<void> {
  if (!isRobinhoodRoute(request)) {
    return;
  }
  if (!config.stocks.enabledDirections.includes(request.rampType)) {
    throw new APIError({ isPublic: true, message: `Invalid network: ${Networks.Robinhood}`, status: httpStatus.BAD_REQUEST });
  }

  if (!isBrlPixRobinhoodRoute(request)) {
    return;
  }

  const token = request.rampType === RampDirection.BUY ? request.outputCurrency : request.inputCurrency;
  if (!isStockSymbol(token)) {
    throw new APIError({ isPublic: true, message: QuoteError.StockTokenNotAvailable, status: httpStatus.BAD_REQUEST });
  }
  // The ticket rounds a finer amount to 18 decimals while the flow floors it, so its echo could differ from what moves.
  if (request.rampType === RampDirection.SELL) {
    const amount = new Big(request.inputAmount);
    if (!amount.round(STOCK_TOKEN_DECIMALS, Big.roundDown).eq(amount)) {
      throw new APIError({
        isPublic: true,
        message: `The amount has more than ${STOCK_TOKEN_DECIMALS} decimal places.`,
        status: httpStatus.BAD_REQUEST
      });
    }
  }
  await assertStockTradable(token);
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

export default new QuoteService();
