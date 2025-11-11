import {
  GetSupportedCountriesRequest,
  GetSupportedCountriesResponse,
  GetSupportedCountryResponse,
  SUPPORTED_COUNTRIES
} from "@vortexfi/shared";
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
  res: Response<GetSupportedCountriesResponse | GetSupportedCountryResponse | { error: string }>,
  next: NextFunction
): Promise<void> => {
  try {
    const { countryCode, name, fiatCurrency } = req.query;

    // Priority 1: Lookup by country code
    if (countryCode) {
      const country = SUPPORTED_COUNTRIES.find(c => c.countryCode.toLowerCase() === countryCode.toLowerCase());

      if (!country) {
        res.status(httpStatus.NOT_FOUND).json({
          error: `Country with code '${countryCode}' not found`
        });
        return;
      }

      res.status(httpStatus.OK).json({ country });
      return;
    }

    // Priority 2: Lookup by country name
    if (name) {
      const country = SUPPORTED_COUNTRIES.find(c => c.name.toLowerCase() === name.toLowerCase());

      if (!country) {
        res.status(httpStatus.NOT_FOUND).json({
          error: `Country with name '${name}' not found`
        });
        return;
      }

      res.status(httpStatus.OK).json({ country });
      return;
    }

    // Priority 3: Filter by fiat currency
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
