export function getCryptoCode(fromCrypto: string): string {
  // If fromCrypto is USDC, we need to convert it to USDC_Polygon
  if (
    fromCrypto.toLowerCase() === 'usdc' ||
    fromCrypto.toLowerCase() === 'usdc.e' ||
    fromCrypto.toLowerCase() === 'usdce'
  ) {
    return 'usdc_polygon';
  }
  if (fromCrypto.toLowerCase() === 'usdt') {
    return 'usdt';
  }

  return fromCrypto.toLowerCase();
}

export function getFiatCode(toFiat: string): string {
  return toFiat.toLowerCase();
}
