import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import { QuoteEndpoints } from 'shared/src/endpoints/quote.endpoints';
import quoteService from '../services/ramp/quote.service';
import { APIError } from '../errors/api-error';
import logger from '../../config/logger';

/**
 * Create a new quote
 * @public
 */
export const createQuote = async (
  req: Request<{}, {}, QuoteEndpoints.CreateQuoteRequest>,
  res: Response<QuoteEndpoints.QuoteResponse>,
  next: NextFunction
): Promise<void> => {
  try {
    const { rampType, from, to, inputAmount, inputCurrency, outputCurrency } = req.body;

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
    });

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
  next: NextFunction
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
