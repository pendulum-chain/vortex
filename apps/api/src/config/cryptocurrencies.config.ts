import {
  AssetHubToken,
  assethubTokenConfig,
  EvmNetworks,
  EvmToken,
  evmTokenConfig,
  isNetworkAssetHub,
  isNetworkEVM,
  Networks,
  SupportedCryptocurrencyDetails
} from "@vortexfi/shared";
import { APIError } from "../api/errors/api-error";

const supportedNetworks = Object.values(Networks)
  .filter(network => isNetworkEVM(network) || isNetworkAssetHub(network))
  .join("', '");

const throwInvalidNetworkError = (network: string): never => {
  throw new APIError({
    message: `Invalid network: '${network}'. Supported networks are: '${supportedNetworks}'`
  });
};

const mapEvmTokenToDetails = (network: EvmNetworks, token: EvmToken): SupportedCryptocurrencyDetails => {
  const details = evmTokenConfig[network][token];
  if (!details) {
    throw new APIError({
      message: `Token '${token}' is not supported on network '${network}'.`
    });
  }

  return {
    assetContractAddress: details.erc20AddressSourceChain,
    assetDecimals: details.decimals,
    assetNetwork: details.network,
    assetSymbol: details.assetSymbol
  };
};

const mapAssetHubTokenToDetails = (token: AssetHubToken): SupportedCryptocurrencyDetails => {
  const details = assethubTokenConfig[token];
  return {
    assetDecimals: details.decimals,
    assetForeignAssetId: details.foreignAssetId,
    assetNetwork: details.network,
    assetSymbol: details.assetSymbol
  };
};

const getEvmNetworkTokens = (network: Networks): SupportedCryptocurrencyDetails[] => {
  if (isNetworkEVM(network)) {
    const availableTokens = Object.keys(evmTokenConfig[network]) as EvmToken[];
    return availableTokens.map(token => mapEvmTokenToDetails(network, token));
  } else {
    return throwInvalidNetworkError(network);
  }
};

const getAssetHubTokens = (): SupportedCryptocurrencyDetails[] => {
  return Object.values(AssetHubToken).map(mapAssetHubTokenToDetails);
};

const getAllEvmNetworkTokens = (): SupportedCryptocurrencyDetails[] =>
  Object.values(Networks).filter(isNetworkEVM).flatMap(getEvmNetworkTokens);

const getAllNetworkTokens = (): SupportedCryptocurrencyDetails[] => [...getAllEvmNetworkTokens(), ...getAssetHubTokens()];

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
