import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault, Networks, FiatToken, OnChainToken } from 'shared';
import { RampDirection } from '../../../../components/RampToggle';

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
  fiatToken: FiatToken,
) {
  const isOnramp = rampDirection === RampDirection.ONRAMP;
  const onChainTokenDetails = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const fiatTokenDetails = getAnyFiatTokenDetails(fiatToken);

  return {
    sourceAssetSymbol: isOnramp ? fiatTokenDetails.fiat.symbol : onChainTokenDetails.assetSymbol,
    targetAssetSymbol: isOnramp ? onChainTokenDetails.assetSymbol : fiatTokenDetails.fiat.symbol,
    onChainTokenDetails,
    fiatTokenDetails,
  };
}
