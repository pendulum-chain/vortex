import {
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
      to
    });

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error(`Error creating quote: ${error instanceof Error ? error.message : String(error)}`);
    next(error);
  }
};

/**
 * Create a best quote across all eligible networks
 * @public
 */
export const createBestQuote = async (
  req: Request<unknown, unknown, Omit<CreateQuoteRequest, "network">>,
  res: Response<QuoteResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, partnerId, apiKey } = req.body;

    // Get apiKey from body or from validated public key middleware
    const publicApiKey = apiKey || req.validatedPublicKey?.apiKey;
    const publicKeyPartnerName = req.validatedPublicKey?.partnerName;

    // Create best quote by querying all eligible networks
    const quote = await quoteService.createBestQuote({
      apiKey: publicApiKey,
      from,
      inputAmount,
      inputCurrency,
      outputCurrency,
      partnerId,
      partnerName: publicKeyPartnerName,
      rampType,
      to
    });

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error(`Error creating best quote: ${error instanceof Error ? error.message : String(error)}`);
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

    res.status(httpStatus.OK).json(quote);
  } catch (error) {
    logger.error("Error getting quote:", error);
    next(error);
  }
};
