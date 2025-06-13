const NETWORK_MAP: Record<string, string> = {
  POLYGON: 'MATIC',
  BSC: 'BSC',
  ARBITRUM: 'ARBITRUM',
  AVALANCHE: 'AVAX',
  ETHEREUM: 'ETH',
};

const CRYPTO_MAP: Record<string, string> = {
  usdc: 'USDC',
  'usdc.e': 'USDC.e',
  usdce: 'USDC.e',
  usdt: 'USDT',
};

/**
 * Get the AlchemyPay network code
 * @param network The network name
 * @returns The AlchemyPay network code
 */
export function getAlchemyPayNetworkCode(network: string): string {
  return NETWORK_MAP[network.toUpperCase()] ?? network;
}

/**
 * Get the cryptocurrency code for AlchemyPay
 * @param fromCrypto The cryptocurrency code
 * @returns The AlchemyPay cryptocurrency code
 */
export function getCryptoCurrencyCode(fromCrypto: string): string {
  return CRYPTO_MAP[fromCrypto.toLowerCase()] ?? fromCrypto.toUpperCase();
}

/**
 * Get the fiat currency code for AlchemyPay
 * @param toFiat The fiat currency code
 * @returns The AlchemyPay fiat currency code
 */
export function getFiatCode(toFiat: string): string {
  // The currencies need to be in uppercase
  return toFiat.toUpperCase();
}
