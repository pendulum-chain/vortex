import Big from 'big.js';
import { NextFunction, Request, Response } from 'express';
import httpStatus from 'http-status';
import { QuoteEndpoints } from 'shared/src/endpoints/quote.endpoints';
import logger from '../../config/logger';
import { ASSETHUB_XCM_FEE_USDC_UNITS } from '../../constants/constants';
import { APIError } from '../errors/api-error';
import quoteService from '../services/ramp/quote.service';

/**
 * Create a new quote
 * @public
 */
export const createQuote = async (
  req: Request<{}, {}, QuoteEndpoints.CreateQuoteRequest>,
  res: Response<QuoteEndpoints.QuoteResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency, partnerId } = req.body;

    // Validate required fields
    if (!rampType || !from || !to || !inputAmount || !inputCurrency || !outputCurrency) {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Missing required fields',
      });
    }

    // Validate ramp type
    if (rampType !== 'on' && rampType !== 'off') {
      throw new APIError({
        status: httpStatus.BAD_REQUEST,
        message: 'Invalid ramp type, must be "on" or "off"',
      });
    }

    // Create quote
    const quote = await quoteService.createQuote({
      rampType,
      from,
      to,
      inputAmount,
      inputCurrency,
      outputCurrency,
      partnerId,
    });

    // TODO temporary fix. Reduce output amount if onramp to assethub by expected xcm fee.
    if (rampType === 'on' && to === 'assethub') {
      quote.outputAmount = new Big(quote.outputAmount).sub(ASSETHUB_XCM_FEE_USDC_UNITS).toFixed();
    }

    res.status(httpStatus.CREATED).json(quote);
  } catch (error) {
    logger.error('Error creating quote:', error);
    next(error);
  }
};

/**
 * Get a quote by ID
 * @public
 */
export const getQuote = async (
  req: Request<QuoteEndpoints.GetQuoteRequest>,
  res: Response<QuoteEndpoints.QuoteResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { id } = req.params;

    const quote = await quoteService.getQuote(id);

    if (!quote) {
      throw new APIError({
        status: httpStatus.NOT_FOUND,
        message: 'Quote not found',
      });
    }

    res.status(httpStatus.OK).json(quote);
  } catch (error) {
    logger.error('Error getting quote:', error);
    next(error);
  }
};
