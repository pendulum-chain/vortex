import {
  AssetHubToken,
  assetHubTokenConfig,
  EvmNetworks,
  EvmTokenDetails,
  getEvmTokenConfig,
  isNetworkAssetHub,
  isNetworkEVM,
  Networks,
  RampDirection,
  SupportedCryptocurrencyDetails
} from "@vortexfi/shared";
import { APIError } from "../api/errors/api-error";

const supportedNetworks = Object.values(Networks)
  .filter(network => isNetworkEVM(network) || isNetworkAssetHub(network))
  .join("', '");

const throwInvalidNetworkError = (network: string | undefined): never => {
  throw new APIError({
    message: `Invalid network: '${network}'. Supported networks are: '${supportedNetworks}'`
  });
};

const getEvmNetworkTokens = (
  network: EvmNetworks,
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): SupportedCryptocurrencyDetails[] => {
  // The merged config stores static tokens under both their enum key and their symbol; dedupe by contract address.
  const byAddress = new Map<string, SupportedCryptocurrencyDetails>();
  for (const details of Object.values(tokensByNetwork[network] ?? {})) {
    if (!details) continue;
    const address = details.erc20AddressSourceChain.toLowerCase();
    if (byAddress.has(address)) continue;
    byAddress.set(address, {
      assetContractAddress: details.erc20AddressSourceChain,
      assetDecimals: details.decimals,
      assetNetwork: details.network,
      assetSymbol: details.assetSymbol,
      // The flow catalog matches EVM sources and destinations against this same merged token catalog.
      rampTypes: [RampDirection.BUY, RampDirection.SELL]
    });
  }
  return [...byAddress.values()];
};

const getAssetHubTokens = (): SupportedCryptocurrencyDetails[] =>
  Object.values(AssetHubToken).map(token => {
    const details = assetHubTokenConfig[token];
    return {
      assetDecimals: details.decimals,
      assetForeignAssetId: details.foreignAssetId,
      assetNetwork: details.network,
      assetSymbol: details.assetSymbol,
      // Only AssetHub USDC has ramp flows (BRL on/offramp).
      rampTypes: token === AssetHubToken.USDC ? [RampDirection.BUY, RampDirection.SELL] : []
    };
  });

/**
 * Supported cryptocurrencies for a network, including routed EVM tokens discovered from Squid Router.
 * @param network Network filter (required)
 * @param tokensByNetwork EVM token config to read from; defaults to the live dynamic config
 */
export function getSupportedCryptocurrencies(
  network: Networks | undefined,
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> = getEvmTokenConfig()
): SupportedCryptocurrencyDetails[] {
  if (network && isNetworkEVM(network)) {
    return getEvmNetworkTokens(network as EvmNetworks, tokensByNetwork);
  }
  if (network && isNetworkAssetHub(network)) {
    return getAssetHubTokens();
  }
  return throwInvalidNetworkError(network);
}
