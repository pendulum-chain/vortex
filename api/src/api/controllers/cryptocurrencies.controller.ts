import { Request, Response, NextFunction } from 'express';
import httpStatus from 'http-status';
import {
  GetSupportedCryptocurrenciesRequest,
  GetSupportedCryptocurrenciesResponse,
  SupportedCryptocurrencyDetails,
} from 'shared/src/endpoints/supported-cryptocurrencies.endpoints';
import { getSupportedCryptocurrencies } from '../../config/cryptocurrencies.config';

/**
 * Get supported cryptocurrencies with detailed information based on network
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const getSupportedCryptocurrenciesHandler = async (
  req: Request<unknown, unknown, unknown, GetSupportedCryptocurrenciesRequest>,
  res: Response<GetSupportedCryptocurrenciesResponse>,
  next: NextFunction,
): Promise<void> => {
  try {
    const { network } = req.query;

    const cryptocurrencies: SupportedCryptocurrencyDetails[] = getSupportedCryptocurrencies(network);

    res.status(httpStatus.OK).json({
      cryptocurrencies,
    });
  } catch (error) {
    next(error);
  }
};
