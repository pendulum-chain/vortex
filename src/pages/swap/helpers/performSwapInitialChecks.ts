import {
  getInputTokenDetails,
  getOutputTokenDetails,
  isStellarOutputTokenDetails,
} from '../../../constants/tokenConfig';
import { getVaultsForCurrency } from '../../../services/phases/polkadot/spacewalk';
import { testRoute } from '../../../services/phases/squidrouter/route';
import { useOfframpStore } from '../../../stores/offrampStore';

export const performSwapInitialChecks = async () => {
  const offrampState = useOfframpStore.getState();
  const {
    api,
    outputTokenType,
    inputTokenType,
    network,
    address,
    requiresSquidRouter,
    expectedRedeemAmountRaw,
    inputAmountRaw,
  } = offrampState.offrampExecutionInput!;
  const outputTokenDetails = getOutputTokenDetails(outputTokenType);
  const inputTokenDetails = getInputTokenDetails(network, inputTokenType)!;

  if (isStellarOutputTokenDetails(outputTokenDetails)) {
    await Promise.all([
      getVaultsForCurrency(
        api,
        outputTokenDetails.stellarAsset.code.hex,
        outputTokenDetails.stellarAsset.issuer.hex,
        expectedRedeemAmountRaw,
      ),
      requiresSquidRouter ? testRoute(inputTokenDetails, inputAmountRaw, address, network) : Promise.resolve(),
    ]);
  } else {
    await (requiresSquidRouter ? testRoute(inputTokenDetails, inputAmountRaw, address, network) : Promise.resolve());
  }
};
