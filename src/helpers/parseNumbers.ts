import { u128 } from '@polkadot/types-codec';
import BigNumber from 'big.js';

// These are the decimals used for the native currency on the Amplitude network
export const ChainDecimals = 12;

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
  } catch (error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(ChainDecimals);
  return bigIntValue.mul(multiplier);
};

export const decimalToCustom = (value: BigNumber | number | string, decimals: number) => {
  let bigIntValue;
  try {
    bigIntValue = new BigNumber(value);
  } catch (error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(decimals);
  return bigIntValue.mul(multiplier);
};

// Same as above, but handle a string decimal
export const stringDecimalToNative = (value: string) => {
  return decimalToNative(stringDecimalToBN(value, ChainDecimals));
};

export const decimalToStellarNative = (value: BigNumber | number | string) => {
  let bigIntValue;
  try {
    bigIntValue = new BigNumber(value);
  } catch (error) {
    bigIntValue = new BigNumber(0);
  }
  const multiplier = new BigNumber(10).pow(StellarDecimals);
  return bigIntValue.mul(multiplier);
};

// Same as above, but handle a string decimal
export const stringDecimalToStellarNative = (value: string) => {
  return stringDecimalToBN(value, StellarDecimals);
};

// Convert a string decimal to a BigNumber
export const stringDecimalToBN = (value: string, chainDecimals: number) => {
  let [whole, decimal] = value.split('.');
  decimal = decimal || '0';

  //TODO this may not be needed now that we go back to big.js
  // pad the decimal part
  while (decimal.length < chainDecimals) {
    decimal += '0';
  }

  // truncate the decimal part to max chain length digits
  // and concatenate the whole and decimal parts
  decimal = decimal.substring(0, chainDecimals);
  const fullIntegerValue = whole + decimal;

  let bigIntValue;
  try {
    bigIntValue = new BigNumber(fullIntegerValue);
  } catch (error) {
    console.error('Error converting to BigNumber:', error);
    bigIntValue = new BigNumber(0);
  }
  return bigIntValue;
};

export const fixedPointToDecimal = (value: BigNumber | number | string) => {
  const bigIntValue = new BigNumber(value);
  const divisor = new BigNumber(10).pow(FixedU128Decimals);

  return bigIntValue.div(divisor);
};

export const nativeToDecimal = (value: BigNumber | number | string | u128) => {
  if (typeof value === 'string' || value instanceof u128) {
    // Replace the unnecessary ',' with '' to prevent BigNumber from throwing an error
    value = new BigNumber(value.toString().replaceAll(',', ''));
  }
  const bigIntValue = new BigNumber(value);
  const divisor = new BigNumber(10).pow(ChainDecimals);

  return bigIntValue.div(divisor);
};

export const nativeStellarToDecimal = (value: BigNumber | number | string) => {
  const bigIntValue = new BigNumber(value);
  const divisor = new BigNumber(10).pow(StellarDecimals);

  return bigIntValue.div(divisor);
};

export const toBigNumber = (value: BigNumber | number | string, decimals: number) => {
  if (typeof value === 'string' || value instanceof u128) {
    // Replace the unnecessary ',' with '' to prevent BigNumber from throwing an error
    value = new BigNumber(value.toString().replaceAll(',', ''));
  }
  const bigIntValue = new BigNumber(value);

  const divisor = new BigNumber(10).pow(decimals);
  return bigIntValue.div(divisor);
};

const units = [
  { divider: 1e9, prefix: 'billion', char: 'B' },
  { divider: 1e6, prefix: 'million', char: 'M' },
  { divider: 1, prefix: '', char: '' },
  { divider: 1e-3, prefix: 'milli', char: 'm' },
  { divider: 1e-6, prefix: 'micro', char: 'μ' },
  { divider: 1e-9, prefix: 'nano', char: 'n' },
  { divider: 1e-12, prefix: 'pico', char: 'p' },
];

export const format = (n: number, tokenSymbol: string | undefined, oneCharOnly = false) => {
  for (let i = 0; i < units.length; i++) {
    if (n >= units[i].divider) {
      return (
        prettyNumbers(n / units[i].divider) + ' ' + (oneCharOnly ? units[i].char : units[i].prefix + ' ') + tokenSymbol
      );
    }
  }
  return prettyNumbers(n);
};

export const nativeToFormat = (
  value: BigNumber | number | string,
  tokenSymbol: string | undefined,
  oneCharOnly = false,
) => format(nativeToDecimal(value).toNumber(), tokenSymbol, oneCharOnly);

export const prettyNumbers = (number: number, lang?: string, opts?: Intl.NumberFormatOptions) =>
  number.toLocaleString(lang || navigator.language, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
    ...opts,
  });

export const roundNumber = (value: number | string = 0, round = 6) => {
  return +Number(value).toFixed(round);
};
