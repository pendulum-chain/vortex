/**
 * Numora renders amounts with the active locale's separators (de-DE "1.234,56"), while the quote
 * wire and every `Number(...)` parse need a plain dot-decimal string. The two representations are
 * converted at the input boundary rather than anywhere else.
 */

export function toRawAmount(display: string, decimalSeparator: string, thousandSeparator: string): string {
  return display.split(thousandSeparator).join("").replace(decimalSeparator, ".");
}

export function toDisplayAmount(raw: string, decimalSeparator: string): string {
  return raw.replace(".", decimalSeparator);
}

/**
 * Fiat rails settle to cents while on-chain legs are quoted at six decimals, so flipping direction
 * has to cut the extra digits instead of sending an amount the ramp would reject.
 */
export function clampDecimals(raw: string, maxDecimals: number): string {
  const separator = raw.indexOf(".");
  if (separator === -1 || raw.length - separator - 1 <= maxDecimals) {
    return raw;
  }
  return maxDecimals === 0 ? raw.slice(0, separator) : raw.slice(0, separator + maxDecimals + 1);
}
