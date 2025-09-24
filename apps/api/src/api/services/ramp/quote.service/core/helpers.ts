import { DestinationType, Networks, RampCurrency, RampDirection } from "@packages/shared";
import httpStatus from "http-status";
import { APIError } from "../../../../errors/api-error";

/**
 * Supported chains configuration for ramp operations
 */
export const SUPPORTED_CHAINS: {
  [RampDirection.SELL]: { from: DestinationType[]; to: DestinationType[] };
  [RampDirection.BUY]: { from: DestinationType[]; to: DestinationType[] };
} = {
  [RampDirection.SELL]: {
    from: [
      Networks.AssetHub,
      Networks.Avalanche,
      Networks.Arbitrum,
      Networks.BSC,
      Networks.Base,
      Networks.Ethereum,
      Networks.Polygon
    ],
    to: ["pix", "sepa", "cbu"]
  },
  [RampDirection.BUY]: {
    from: ["pix", "sepa"],
    to: [
      Networks.AssetHub,
      Networks.Avalanche,
      Networks.Arbitrum,
      Networks.BSC,
      Networks.Base,
      Networks.Ethereum,
      Networks.Polygon
    ]
  }
};

/**
 * Determines the target fiat currency for fee calculations based on ramp type
 * @param rampType - The type of ramp operation
 * @param inputCurrency - The input currency
 * @param outputCurrency - The output currency
 * @returns The target fiat currency for fee calculations
 */
export function getTargetFiatCurrency(
  rampType: RampDirection,
  inputCurrency: RampCurrency,
  outputCurrency: RampCurrency
): RampCurrency {
  // TODO: Add validation to ensure the identified currency is a supported fiat currency
  if (rampType === RampDirection.BUY) {
    // Assuming input is the fiat currency for on-ramp (e.g., BRL from pix)
    return inputCurrency;
  }
  // off-ramp: Assuming output is the fiat currency for off-ramp (e.g., BRL to pix, EUR to sepa)
  return outputCurrency;
}

/**
 * Validates that the specified chain combination is supported for the given ramp type
 * @param rampType - The type of ramp operation
 * @param from - The source destination type
 * @param to - The target destination type
 * @throws APIError if the chain combination is not supported
 */
export function validateChainSupport(rampType: RampDirection, from: DestinationType, to: DestinationType): void {
  if (!SUPPORTED_CHAINS[rampType].from.includes(from) || !SUPPORTED_CHAINS[rampType].to.includes(to)) {
    const rampTypeStr = rampType === RampDirection.BUY ? "on" : "off";
    throw new APIError({
      message: `${rampTypeStr}ramping from ${from} to ${to} is not supported.`,
      status: httpStatus.BAD_REQUEST
    });
  }
}

/**
 * Trims trailing zeros from a decimal string, keeping at least two decimal places.
 * @param decimalString - The decimal string to format
 * @returns Formatted string with unnecessary trailing zeros removed but at least two decimal places
 */
export function trimTrailingZeros(decimalString: string): string {
  if (!decimalString?.includes(".")) {
    return `${decimalString}.00`;
  }

  // Split string at decimal point
  const [integerPart, fractionalPart] = decimalString.split(".");

  // Trim trailing zeros but ensure there are at least 2 decimal places
  let trimmedFraction = fractionalPart.replace(/0+$/g, "");

  // If all were zeros or not enough digits, pad to 2 decimal places
  if (trimmedFraction.length === 0) {
    trimmedFraction = "00";
  } else if (trimmedFraction.length === 1) {
    trimmedFraction += "0";
  }

  return `${integerPart}.${trimmedFraction}`;
}
