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
import { BASE_PAXG_ADDRESS } from "../api/services/phases/blocks/core/gold-base";
import { isRetiredAssetHubCorridor, validateChainSupport } from "../api/services/phases/blocks/core/helpers";
import { ROBINHOOD_STOCKS, STOCK_TOKEN_DECIMALS } from "../api/services/phases/blocks/core/robinhood-stocks";
import { config } from "./vars";

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

const directionsEnabled = (enabled: RampDirection[]): RampDirection[] =>
  [RampDirection.BUY, RampDirection.SELL].filter(direction => enabled.includes(direction));

const getEvmNetworkTokens = (
  network: EvmNetworks,
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>>,
  paymentMethod: string
): SupportedCryptocurrencyDetails[] => {
  // The flow catalog matches EVM sources and destinations structurally, so every listed token shares
  // the network's directions.
  const rampTypes = rampTypesFor(network);
  // The merged config stores static tokens under both their enum key and their symbol; dedupe by contract address.
  const byAddress = new Map<string, SupportedCryptocurrencyDetails>();
  // Only the two exact rail names select a Gold switch; any other value lists no Gold route. Compared directly, not
  // looked up in an object: the value comes from the query string, and a name such as "constructor" would resolve.
  const goldDirections =
    paymentMethod === "pix" ? config.gold.enabledDirections : paymentMethod === "usdc" ? config.gold.usdcEnabledDirections : [];
  for (const details of Object.values(tokensByNetwork[network] ?? {})) {
    if (!details) continue;
    const address = details.erc20AddressSourceChain.toLowerCase();
    if (byAddress.has(address)) continue;
    // PAXG on Base is served by the Gold routes alone, each rail behind its own switch. With none enabled it is not listed.
    const isBasePaxg = network === Networks.Base && address === BASE_PAXG_ADDRESS.toLowerCase();
    const tokenRampTypes = isBasePaxg ? directionsEnabled(goldDirections) : rampTypes;
    if (isBasePaxg && tokenRampTypes.length === 0) continue;
    byAddress.set(address, {
      assetContractAddress: details.erc20AddressSourceChain,
      assetDecimals: details.decimals,
      assetNetwork: details.network,
      assetSymbol: details.assetSymbol,
      rampTypes: tokenRampTypes
    });
  }
  return [...byAddress.values()];
};

/** Only the allowlist is public on Robinhood Chain: ETH, USDG and anything discovered there are never ramp assets. */
const getRobinhoodStockTokens = (paymentMethod = "pix"): SupportedCryptocurrencyDetails[] => {
  const rampTypes = [RampDirection.BUY, RampDirection.SELL].filter(direction =>
    (paymentMethod === "usdc" ? config.stocks.usdcEnabledDirections : config.stocks.enabledDirections).includes(direction)
  );
  return Object.entries(ROBINHOOD_STOCKS).map(([assetSymbol, { address }]) => ({
    assetContractAddress: address,
    assetDecimals: STOCK_TOKEN_DECIMALS,
    assetNetwork: Networks.Robinhood,
    assetSymbol,
    rampTypes
  }));
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
  tokensByNetwork: Record<EvmNetworks, Partial<Record<string, EvmTokenDetails>>> = getEvmTokenConfig(),
  paymentMethod = "pix"
): SupportedCryptocurrencyDetails[] {
  if (network === Networks.Robinhood) {
    if (!["pix", "usdc"].includes(paymentMethod)) throw new APIError({ message: "Invalid stock payment method", status: 400 });
    return getRobinhoodStockTokens(paymentMethod);
  }
  if (network && isNetworkEVM(network)) {
    return getEvmNetworkTokens(network as EvmNetworks, tokensByNetwork, paymentMethod);
  }
  if (network && isNetworkAssetHub(network)) {
    return getAssetHubTokens();
  }
  return throwInvalidNetworkError(network);
}
