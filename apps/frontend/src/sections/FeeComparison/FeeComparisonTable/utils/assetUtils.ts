import {
  FiatToken,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  Networks,
  OnChainToken,
  RampDirection
} from "@vortexfi/shared";

/**
 * Determines source and target asset symbols based on ramp direction
 * @param rampDirection Current ramp direction (onramp or offramp)
 * @param selectedNetwork Selected network (must be a valid Networks enum value)
 * @param onChainToken On-chain token (must be a valid OnChainToken value)
 * @param fiatToken Fiat token (must be a valid FiatToken enum value)
 * @returns Object containing source and target asset symbols
 */
export function getAssetSymbols(
  rampDirection: RampDirection,
  selectedNetwork: Networks,
  onChainToken: OnChainToken,
  fiatToken: FiatToken
) {
  const isOnramp = rampDirection === RampDirection.BUY;
  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);

  return {
    fiatTokenDetails,
    onChainTokenDetails,
    sourceAssetSymbol: isOnramp ? fiatTokenDetails.fiat.symbol : onChainTokenDetails.assetSymbol,
    targetAssetSymbol: isOnramp ? onChainTokenDetails.assetSymbol : fiatTokenDetails.fiat.symbol
  };
}
