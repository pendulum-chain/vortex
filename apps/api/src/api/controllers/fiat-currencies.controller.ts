import {
  GetSupportedFiatCurrenciesRequest,
  GetSupportedFiatCurrenciesResponse,
  SUPPORTED_FIAT_CURRENCIES
} from "@vortexfi/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";

/**
 * Get supported fiat currencies
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const getSupportedFiatCurrenciesHandler = async (
  req: Request<unknown, unknown, unknown, GetSupportedFiatCurrenciesRequest>,
  res: Response<GetSupportedFiatCurrenciesResponse | { error: string }>,
  next: NextFunction
): Promise<void> => {
  try {
    res.status(httpStatus.OK).json({
      currencies: SUPPORTED_FIAT_CURRENCIES
    });
  } catch (error) {
    next(error);
  }
};
