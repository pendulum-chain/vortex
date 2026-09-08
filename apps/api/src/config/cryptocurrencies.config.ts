import {
  AssetHubToken,
  assetHubTokenConfig,
  EPaymentMethod,
  EvmNetworks,
  EvmTokenDetails,
  FiatToken,
  getEvmTokenConfig,
  isNetworkAssetHub,
  isNetworkEVM,
  Networks,
  RampDirection,
  SupportedCryptocurrencyDetails
} from "@vortexfi/shared";
import { APIError } from "../api/errors/api-error";
import { isRetiredAssetHubCorridor, validateChainSupport } from "../api/services/phases/blocks/core/helpers";

const supportedNetworks = Object.values(Networks)
  .filter(network => isNetworkEVM(network) || isNetworkAssetHub(network))
  .join("', '");

const throwInvalidNetworkError = (network: string | undefined): never => {
  throw new APIError({
    message:
      network === undefined
        ? "Missing required query parameter 'network'. Example: /v1/supported-cryptocurrencies?network=ethereum"
        : `Invalid network: '${network}'. Supported networks are: '${supportedNetworks}'`
  });
};

/**
 * Whether quote creation lets a ramp in this direction touch the network at all, probed through the
 * same guards the quote service applies. The BRL/PIX corridor stands in for the fiat side: chain
 * support is per network, and BRL is the only corridor the AssetHub flows ever had.
 */
const isDirectionAvailable = (network: Networks, rampType: RampDirection): boolean => {
  const probe =
    rampType === RampDirection.BUY
      ? { from: EPaymentMethod.PIX, inputCurrency: FiatToken.BRL, outputCurrency: "", rampType, to: network }
      : { from: network, inputCurrency: "", outputCurrency: FiatToken.BRL, rampType, to: EPaymentMethod.PIX };
  try {
    validateChainSupport(rampType, probe.from, probe.to);
  } catch {
    return false;
  }
  return !isRetiredAssetHubCorridor(probe as Parameters<typeof isRetiredAssetHubCorridor>[0]);
};

const rampTypesFor = (network: Networks): RampDirection[] =>
  [RampDirection.BUY, RampDirection.SELL].filter(rampType => isDirectionAvailable(network, rampType));

const getEvmNetworkTokens = (
  network: EvmNetworks,
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>
): SupportedCryptocurrencyDetails[] => {
  // The flow catalog matches EVM sources and destinations structurally, so every listed token shares
  // the network's directions.
  const rampTypes = rampTypesFor(network);
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
      rampTypes
    });
  }
  return [...byAddress.values()];
};

const getAssetHubTokens = (): SupportedCryptocurrencyDetails[] => {
  const rampTypes = rampTypesFor(Networks.AssetHub);
  return Object.values(AssetHubToken).map(token => {
    const details = assetHubTokenConfig[token];
    return {
      assetDecimals: details.decimals,
      assetForeignAssetId: details.foreignAssetId,
      assetNetwork: details.network,
      assetSymbol: details.assetSymbol,
      rampTypes
    };
  });
};

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
