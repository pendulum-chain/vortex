import { UInt, u128 } from "@polkadot/types-codec";
import BigNumber from "big.js";

// These are the decimals used for the native currency on the Amplitude network
export const ChainDecimals = 12;
export const USDC_DECIMALS = 6;

// These are the decimals used by the Stellar network
// We actually up-scale the amounts on Stellar now to match the expected decimals of the other tokens.
export const StellarDecimals = ChainDecimals;

// These are the decimals used by the FixedU128 type
export const FixedU128Decimals = 18;

// Converts a decimal number to the native representation (a large integer)
export const decimalToNative = (value: BigNumber | number | string) => {
  let bigIntValue;
  try {
    bigIntValue = new BigNumber(value);
  } catch (_error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(ChainDecimals);
  return bigIntValue.mul(multiplier);
};

export const decimalToCustom = (value: BigNumber | number | string, decimals: number) => {
  let bigIntValue;
  try {
    bigIntValue = new BigNumber(value);
  } catch (_error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(decimals);
  return bigIntValue.mul(multiplier);
};

export const decimalToStellarNative = (value: BigNumber | number | string) => {
  let bigIntValue;
  try {
    bigIntValue = new BigNumber(value);
  } catch (_error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(StellarDecimals);
  return bigIntValue.mul(multiplier);
};

export const fixedPointToDecimal = (value: BigNumber | number | string) => {
  const bigIntValue = new BigNumber(value);
  const divisor = new BigNumber(10).pow(FixedU128Decimals);

  return bigIntValue.div(divisor);
};

export const sanitizeNative = (value: BigNumber | number | string | u128 | UInt) => {
  if (!value) return new BigNumber(0);

  if (typeof value === "string" || value instanceof u128 || value instanceof UInt) {
    // Replace the unnecessary ',' with '' to prevent BigNumber from throwing an error
    return new BigNumber(value.toString().replaceAll(",", ""));
  }
  return new BigNumber(value);
};

export const nativeToDecimal = (value: BigNumber | number | string | u128 | UInt, decimals: number = ChainDecimals) => {
  const bigIntValue = sanitizeNative(value);
  const divisor = new BigNumber(10).pow(decimals);

  return bigIntValue.div(divisor);
};

export const nativeStellarToDecimal = (value: BigNumber | number | string) => {
  const bigIntValue = new BigNumber(value);
  const divisor = new BigNumber(10).pow(StellarDecimals);

  return bigIntValue.div(divisor);
};

export const toBigNumber = (value: BigNumber | number | string, decimals: number) => {
  if (typeof value === "string" || value instanceof u128) {
    // Replace the unnecessary ',' with '' to prevent BigNumber from throwing an error
    value = new BigNumber(value.toString().replaceAll(",", ""));
  }
  const bigIntValue = new BigNumber(value);

  const divisor = new BigNumber(10).pow(decimals);
  return bigIntValue.div(divisor);
};

const units = [
  { char: "B", divider: 1e9, prefix: "billion" },
  { char: "M", divider: 1e6, prefix: "million" },
  { char: "", divider: 1, prefix: "" },
  { char: "m", divider: 1e-3, prefix: "milli" },
  { char: "μ", divider: 1e-6, prefix: "micro" },
  { char: "n", divider: 1e-9, prefix: "nano" },
  { char: "p", divider: 1e-12, prefix: "pico" }
];

export const format = (n: number, tokenSymbol: string | undefined, oneCharOnly = false) => {
  for (let i = 0; i < units.length; i++) {
    if (n >= units[i].divider) {
      return prettyNumbers(n / units[i].divider) + " " + (oneCharOnly ? units[i].char : units[i].prefix + " ") + tokenSymbol;
    }
  }
  return prettyNumbers(n);
};

export const nativeToFormat = (value: BigNumber | number | string, tokenSymbol: string | undefined, oneCharOnly = false) =>
  format(nativeToDecimal(value).toNumber(), tokenSymbol, oneCharOnly);

export const prettyNumbers = (number: number, lang?: string, opts?: Intl.NumberFormatOptions) =>
  number.toLocaleString(lang || navigator.language, {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
    ...opts
  });

export const roundNumber = (value: number | string = 0, round = 6) => {
  return +Number(value).toFixed(round);
};

export function roundDownToSignificantDecimals(big: BigNumber, decimals: number) {
  return big.prec(Math.max(0, big.e + 1) + decimals, 0);
}

export function roundDownToTwoDecimals(big: BigNumber): string {
  return roundDownToSignificantDecimals(big, 2).toFixed(2, 0);
}
