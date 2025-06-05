import {
  SupportedCryptocurrencyDetails,
  assetHubTokenConfig,
  evmTokenConfig,
  EvmToken,
  AssetHubToken,
  isNetworkEVM,
  isNetworkAssetHub,
  Networks,
} from 'shared';
import { APIError } from '../api/errors/api-error';

const supportedNetworks = Object.values(Networks)
  .filter((network) => isNetworkEVM(network) || isNetworkAssetHub(network))
  .join("', '");

const throwInvalidNetworkError = (network: string): never => {
  throw new APIError({
    message: `Invalid network: '${network}'. Supported networks are: '${supportedNetworks}'`,
  });
};

const mapEvmTokenToDetails = (network: Networks, token: EvmToken): SupportedCryptocurrencyDetails => {
  const details = evmTokenConfig[network][token];
  return {
    assetSymbol: details.assetSymbol,
    assetContractAddress: details.erc20AddressSourceChain,
    assetNetwork: details.network,
    assetDecimals: details.decimals,
  };
};

const mapAssetHubTokenToDetails = (token: AssetHubToken): SupportedCryptocurrencyDetails => {
  const details = assetHubTokenConfig[token];
  return {
    assetSymbol: details.assetSymbol,
    assetForeignAssetId: details.foreignAssetId,
    assetNetwork: details.network,
    assetDecimals: details.decimals,
  };
};

const getEvmNetworkTokens = (network: Networks): SupportedCryptocurrencyDetails[] => {
  if (!isNetworkEVM(network)) {
    throwInvalidNetworkError(network);
  }
  return Object.values(EvmToken).map((token) => mapEvmTokenToDetails(network, token));
};

const getAssetHubTokens = (): SupportedCryptocurrencyDetails[] => {
  return Object.values(AssetHubToken).map(mapAssetHubTokenToDetails);
};

const getAllEvmNetworkTokens = (): SupportedCryptocurrencyDetails[] =>
  Object.values(Networks).filter(isNetworkEVM).flatMap(getEvmNetworkTokens);

const getAllNetworkTokens = (): SupportedCryptocurrencyDetails[] => [
  ...getAllEvmNetworkTokens(),
  ...getAssetHubTokens(),
];

/**
 * Function to get supported cryptocurrencies with details based on network
 * @param network Optional network filter
 * @returns Array of enhanced token details
 */
export function getSupportedCryptocurrencies(network?: Networks): SupportedCryptocurrencyDetails[] {
  if (network && isNetworkEVM(network)) {
    return getEvmNetworkTokens(network);
  }

  if (network && isNetworkAssetHub(network)) {
    return getAssetHubTokens();
  }

  if (!network) {
    return getAllNetworkTokens();
  }

  throwInvalidNetworkError(network);

  return [];
}
