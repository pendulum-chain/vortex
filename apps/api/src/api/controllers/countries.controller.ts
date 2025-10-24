import { GetSupportedCountriesRequest, GetSupportedCountriesResponse, SUPPORTED_COUNTRIES } from "@packages/shared";
import { NextFunction, Request, Response } from "express";
import httpStatus from "http-status";

/**
 * Get supported countries with detailed information
 * @param req - Express request object
 * @param res - Express response object
 * @param next - Express next function
 */
export const getSupportedCountriesHandler = async (
  req: Request<unknown, unknown, unknown, GetSupportedCountriesRequest>,
  res: Response<GetSupportedCountriesResponse | { error: string }>,
  next: NextFunction
): Promise<void> => {
  try {
    const { fiatCurrency } = req.query;

    let countries = SUPPORTED_COUNTRIES;

    if (fiatCurrency) {
      countries = countries.filter(country => country.supportedCurrencies.includes(fiatCurrency));
    }

    res.status(httpStatus.OK).json({
      countries
    });
  } catch (error) {
    next(error);
  }
};
