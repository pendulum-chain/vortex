/**
 * Utility functions for Transak service
 */

/**
 * Normalize cryptocurrency code for Transak API
 * @param fromCrypto The cryptocurrency code to normalize
 * @returns Normalized cryptocurrency code
 */
export function getCryptoCode(fromCrypto: string): string {
  const normalizedCrypto = fromCrypto.toLowerCase();
  if (["usdc", "usdc.e", "usdce"].includes(normalizedCrypto)) {
    return "USDC";
  }
  if (normalizedCrypto === "usdt") {
    return "USDT";
  }
  return fromCrypto.toUpperCase();
}

/**
 * Normalize fiat currency code for Transak API
 * @param toFiat The fiat currency code to normalize
 * @returns Normalized fiat currency code
 */
export function getFiatCode(toFiat: string): string {
  return toFiat.toUpperCase();
}
