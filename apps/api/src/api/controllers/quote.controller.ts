import { CreateQuoteRequest, GetQuoteRequest, Networks, QuoteError, QuoteResponse, RampDirection } from "@packages/shared";
import Big from "big.js";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";
import logger from "../../config/logger";
import { ASSETHUB_XCM_FEE_USDC_UNITS } from "../../constants/constants";
import { APIError } from "../errors/api-error";
import quoteService from "../services/ramp/quote.service";

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
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, partnerId } = req.body;

    // Create quote
    const quote = await quoteService.createQuote({
      from,
      inputAmount,
      inputCurrency,
      outputCurrency,
      partnerId,
      rampType,
      to
    });

    // TODO temporary fix. Reduce output amount if onramp to assethub by expected xcm fee.
    if (rampType === RampDirection.BUY && to === Networks.AssetHub) {
      quote.outputAmount = new Big(quote.outputAmount).sub(ASSETHUB_XCM_FEE_USDC_UNITS).toFixed();
    }

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error(`Error creating quote: ${error instanceof Error ? error.message : String(error)}`);
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
