import { CreateQuoteRequest, GetQuoteRequest, QuoteResponse } from "@packages/shared";
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

    // Validate required fields
    if (!rampType || !from || !to || !inputAmount || !inputCurrency || !outputCurrency) {
      throw new APIError({
        message: "Missing required fields",
        status: httpStatus.BAD_REQUEST
      });
    }

    // Validate ramp type
    if (rampType !== "on" && rampType !== "off") {
      throw new APIError({
        message: 'Invalid ramp type, must be "on" or "off"',
        status: httpStatus.BAD_REQUEST
      });
    }

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
    if (rampType === "on" && to === "assethub") {
      quote.outputAmount = new Big(quote.outputAmount).sub(ASSETHUB_XCM_FEE_USDC_UNITS).toFixed();
    }

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error("Error creating quote:", error);
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
        message: "Quote not found",
        status: httpStatus.NOT_FOUND
      });
    }

    res.status(httpStatus.OK).json(quote);
  } catch (error) {
    logger.error("Error getting quote:", error);
    next(error);
  }
};
