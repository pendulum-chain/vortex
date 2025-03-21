import { OfframpingPhase } from '../../services/offrampingFlow';

import { getTokenDetailsSpacewalk, getPendulumDetails, FiatToken } from '../../constants/tokenConfig';
import { Networks, isNetworkEVM, getNetworkDisplayName } from '../../helpers/networks';
import { OfframpingState } from '../../services/offrampingFlow';
import { OnrampingState } from '../../services/onrampingFlow';

export function createOfframpingPhaseMessage(
  offrampingState: OfframpingState | OnrampingState,
  network: Networks,
): string {
  const flowType = offrampingState.flowType;
  const inputTokenPendulumDetails = getPendulumDetails(network, offrampingState.inputTokenType);
  const outputTokenPendulumDetails = getPendulumDetails(network, offrampingState.outputTokenType);
  const { phase } = offrampingState;

  if (phase === 'success') return 'Transaction completed successfully';

  const messages: Record<OfframpingPhase, string> = {
    prepareTransactions: isNetworkEVM(network)
      ? `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from AssetHub --> Pendulum`,
    squidRouter: isNetworkEVM(network)
      ? `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from AssetHub --> Pendulum`,
    pendulumFundEphemeral: isNetworkEVM(network)
      ? `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from AssetHub --> Pendulum`,
    executeMoonbeamToPendulumXCM: `Transferring ${inputTokenPendulumDetails.pendulumAssetSymbol} from Moonbeam --> Pendulum`,
    executeAssetHubToPendulumXCM: `Bridging ${inputTokenPendulumDetails.pendulumAssetSymbol} from AssetHub --> Pendulum`,
    executePendulumToMoonbeamXCM: `Transferring ${outputTokenPendulumDetails.pendulumAssetSymbol} from Pendulum --> Moonbeam`,
    subsidizePreSwap: `Swapping to ${outputTokenPendulumDetails.pendulumAssetSymbol} on Vortex DEX`,
    nablaApprove: `Swapping to ${outputTokenPendulumDetails.pendulumAssetSymbol} on Vortex DEX`,
    nablaSwap: `Swapping to ${outputTokenPendulumDetails.pendulumAssetSymbol} on Vortex DEX`,
    subsidizePostSwap: `Swapping to ${outputTokenPendulumDetails.pendulumAssetSymbol} on Vortex DEX`,
    executeSpacewalkRedeem:
      flowType === 'evm-to-stellar' || flowType === 'assethub-to-stellar'
        ? `Bridging ${
            getTokenDetailsSpacewalk(offrampingState.outputTokenType as FiatToken).stellarAsset.code.string
          } to Stellar via Spacewalk`
        : '',
    pendulumCleanup: 'Transferring to local partner for bank transfer',
    stellarOfframp: 'Transferring to local partner for bank transfer',
    stellarCleanup: 'Transferring to local partner for bank transfer',
    performBrlaPayoutOnMoonbeam: `Transferring to local partner for bank transfer`,
  };

  return messages[phase as OfframpingPhase];
}
