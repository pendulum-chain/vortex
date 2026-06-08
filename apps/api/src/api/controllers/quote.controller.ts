import {
  CreateBestQuoteRequest,
  CreateQuoteRequest,
  GetQuoteRequest,
  getNetworkFromDestination,
  QuoteError,
  QuoteResponse,
  RampDirection
} from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { APIError } from "../errors/api-error";
import { observeApiClientEvent } from "../observability/apiClientEvent.service";
import { classifyApiClientError, getErrorMessage } from "../observability/errorClassifier";
import { getRequestDurationMs } from "../observability/requestContext";
import quoteService from "../services/quote";

/**
 * Create a new quote
 * @public
 */
export const createQuote = async (
  req: Request<unknown, unknown, CreateQuoteRequest>,
  res: Response<QuoteResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, partnerId, apiKey } = req.body;

    const network = getNetworkFromDestination(rampType === RampDirection.BUY ? to : from);

    if (!network) {
      throw new APIError({
        message: `Unable to determine network from ${rampType === RampDirection.BUY ? "to" : "from"} destination`,
        status: httpStatus.BAD_REQUEST
      });
    }

    // Get apiKey from body or from validated public key middleware
    const publicApiKey = apiKey || req.validatedPublicKey?.apiKey;
    const publicKeyPartnerName = req.validatedPublicKey?.partnerName;

    // Create quote with public key and partner name for discount application
    const quote = await quoteService.createQuote({
      apiKey: publicApiKey,
      from,
      inputAmount,
      inputCurrency,
      network,
      outputCurrency,
      partnerId,
      partnerName: publicKeyPartnerName,
      rampType,
      to,
      userId: req.userId
    });

    observeApiClientEvent({
      apiKeyPrefix: getSafePublicKeyPrefix(publicApiKey),
      durationMs: getRequestDurationMs(req),
      httpStatus: httpStatus.CREATED,
      network,
      operation: "quote_create",
      partnerId: req.authenticatedPartner?.id || partnerId || null,
      partnerName: req.authenticatedPartner?.name || publicKeyPartnerName || null,
      paymentMethod: quote.paymentMethod,
      quoteId: quote.id,
      rampType,
      requestId: req.requestId,
      status: "success",
      userId: req.userId || null
    });

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error("Error creating quote", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeQuoteFailure(req, "quote_create", error, {
      apiKeyPrefix: getSafePublicKeyPrefix(req.body?.apiKey || req.validatedPublicKey?.apiKey),
      network: getNetworkFromDestination(req.body?.rampType === RampDirection.BUY ? req.body?.to : req.body?.from),
      partnerId: req.authenticatedPartner?.id || req.body?.partnerId || null,
      partnerName: req.authenticatedPartner?.name || req.validatedPublicKey?.partnerName || null,
      paymentMethod: req.body?.paymentMethod,
      rampType: req.body?.rampType
    });
    next(error);
  }
};

/**
 * Create a best quote across all eligible networks
 * @public
 */
export const createBestQuote = async (
  req: Request<unknown, unknown, CreateBestQuoteRequest>,
  res: Response<QuoteResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, partnerId, apiKey, countryCode, networks } =
      req.body;

    // Get apiKey from body or from validated public key middleware
    const publicApiKey = apiKey || req.validatedPublicKey?.apiKey;
    const publicKeyPartnerName = req.validatedPublicKey?.partnerName;

    // Create best quote by querying all eligible networks
    const quote = await quoteService.createBestQuote({
      apiKey: publicApiKey,
      countryCode,
      from,
      inputAmount,
      inputCurrency,
      networks,
      outputCurrency,
      partnerId,
      partnerName: publicKeyPartnerName,
      rampType,
      to,
      userId: req.userId
    });

    observeApiClientEvent({
      apiKeyPrefix: getSafePublicKeyPrefix(publicApiKey),
      durationMs: getRequestDurationMs(req),
      httpStatus: httpStatus.CREATED,
      network: quote.network,
      operation: "quote_create_best",
      partnerId: req.authenticatedPartner?.id || partnerId || null,
      partnerName: req.authenticatedPartner?.name || publicKeyPartnerName || null,
      paymentMethod: quote.paymentMethod,
      quoteId: quote.id,
      rampType,
      requestId: req.requestId,
      status: "success",
      userId: req.userId || null
    });

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error("Error creating best quote", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeQuoteFailure(req, "quote_create_best", error, {
      apiKeyPrefix: getSafePublicKeyPrefix(req.body?.apiKey || req.validatedPublicKey?.apiKey),
      partnerId: req.authenticatedPartner?.id || req.body?.partnerId || null,
      partnerName: req.authenticatedPartner?.name || req.validatedPublicKey?.partnerName || null,
      rampType: req.body?.rampType
    });
    next(error);
  }
};

/**
 * Get a quote by ID
 * @public
 */
export const getQuote = async (
  req: Request<GetQuoteRequest>,
  res: Response<QuoteResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { id } = req.params;

    const quote = await quoteService.getQuote(id);

    if (!quote) {
      throw new APIError({
        message: QuoteError.QuoteNotFound,
        status: httpStatus.NOT_FOUND
      });
    }

    observeApiClientEvent({
      durationMs: getRequestDurationMs(req),
      httpStatus: httpStatus.OK,
      network: quote.network,
      operation: "quote_get",
      paymentMethod: quote.paymentMethod,
      quoteId: quote.id,
      rampType: quote.rampType,
      requestId: req.requestId,
      status: "success",
      userId: req.userId || null
    });

    res.status(httpStatus.OK).json(quote);
  } catch (error) {
    logger.error("Error getting quote", { errorType: classifyApiClientError(error), requestId: req.requestId });
    observeQuoteFailure(req, "quote_get", error, { quoteId: req.params.id });
    next(error);
  }
};

type QuoteOperation = "quote_create" | "quote_create_best" | "quote_get";

interface ObservedQuoteRequest {
  requestId?: string;
  requestStartedAt?: number;
  userId?: string;
}

function observeQuoteFailure(
  req: ObservedQuoteRequest,
  operation: QuoteOperation,
  error: unknown,
  context: {
    apiKeyPrefix?: string | null;
    network?: string | null;
    partnerId?: string | null;
    partnerName?: string | null;
    paymentMethod?: string | null;
    quoteId?: string | null;
    rampType?: string | null;
  } = {}
): void {
  const status = getHttpStatus(error);
  observeApiClientEvent({
    ...context,
    durationMs: getRequestDurationMs(req),
    errorMessage: getErrorMessage(error),
    errorType: classifyApiClientError(error, status),
    httpStatus: status,
    operation,
    requestId: req.requestId,
    status: "failure",
    userId: req.userId || null
  });
}

function getHttpStatus(error: unknown): number {
  return error instanceof APIError ? error.status || httpStatus.INTERNAL_SERVER_ERROR : httpStatus.INTERNAL_SERVER_ERROR;
}

function getSafePublicKeyPrefix(apiKey: string | null | undefined): string | null {
  if (!apiKey?.startsWith("pk_")) return null;
  return apiKey.slice(0, 8);
}
