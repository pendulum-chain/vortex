import { EvmToken, AssetHubToken, Networks, isNetworkEVM, isNetworkAssetHub } from 'shared';
import {
  SupportedCryptocurrencyDetails,
} from 'shared/src/endpoints/supported-cryptocurrencies.endpoints';
import { evmTokenConfig } from 'shared/src/tokens/evm/config';
import { assetHubTokenConfig } from 'shared/src/tokens/assethub/config';

/**
 * Function to get supported cryptocurrencies with details based on network
 * @param network Optional network filter (default is Polygon)
 * @returns Array of enhanced token details
 */
export function getSupportedCryptocurrencies(network: Networks | undefined = Networks.Polygon): SupportedCryptocurrencyDetails[] {
  if (network && isNetworkEVM(network)) {
    const tokens = Object.values(EvmToken);

    return tokens.map(token => {
      const details = evmTokenConfig[network][token];
      return {
        assetSymbol: details.assetSymbol,
        assetContractAddress: details.erc20AddressSourceChain,
        assetNetwork: details.network,
        assetDecimals: details.decimals,
      };
    });
  }

  if (network && isNetworkAssetHub(network)) {
    const tokens = Object.values(AssetHubToken);

    return tokens.map(token => {
      const details = assetHubTokenConfig[token];
      return {
        assetSymbol: details.assetSymbol,
        assetForeignAssetId: details.foreignAssetId,
        assetNetwork: details.network,
        assetDecimals: details.decimals,
      };
    });
  }

  return [];
}
