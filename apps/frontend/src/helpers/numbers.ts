import Big from "big.js";

/**
 * Safely parse a formatted string (e.g. "10,000.00" or "10.000,00") into a Big instance.
 * It's robust against different locales by handling both comma and dot as thousands/decimal separators.
 *
 * It works by:
 * 1. Finding the last non-digit character (which is usually the decimal separator).
 * 2. If it is a comma or dot, keeping it as the decimal point while stripping all other commas/dots.
 * 3. Falling back to simple stripping of all commas if no clear decimal is found.
 */
export function parseBig(value: string | number | undefined | null): Big {
  if (value === undefined || value === null || value === "") {
    return Big(0);
  }

  // If it's already a number, convert directly
  if (typeof value === "number") {
    return Big(value);
  }

  const strValue = String(value).trim();

  // Find all non-digit characters that could be separators
  const separators = strValue.match(/[.,]/g);

  if (!separators) {
    // No separators, safe to parse directly
    // Also remove any spaces (e.g. '10 000') just in case
    return Big(strValue.replace(/\s/g, ""));
  }

  // Get the last separator used
  const lastSeparator = separators[separators.length - 1];

  // If there's only one separator and it's a dot, it's standard format
  if (separators.length === 1 && lastSeparator === ".") {
    return Big(strValue.replace(/\s/g, ""));
  }

  // Identify the position of the last separator
  const lastSeparatorIndex = strValue.lastIndexOf(lastSeparator);

  // Split into integer and fractional parts based on the last separator
  const integerPart = strValue.substring(0, lastSeparatorIndex);
  const fractionalPart = strValue.substring(lastSeparatorIndex + 1);

  // Strip all non-digits from the integer part (removes thousands separators, spaces, etc.)
  const cleanInteger = integerPart.replace(/\D/g, "");
  // Keep the fractional part as digits only
  const cleanFractional = fractionalPart.replace(/\D/g, "");

  // Recombine with a dot as the standard decimal separator
  const cleanString = `${cleanInteger}.${cleanFractional}`;

  try {
    return Big(cleanString);
  } catch (error) {
    // Fallback if parsing fails for some reason
    console.warn(`Failed to parse ${value} into Big`, error);
    return Big(0);
  }
}
