import { OfframpingPhase } from '../../services/offrampingFlow';

import { getInputTokenDetailsOrDefault, getOutputTokenDetails } from '../../constants/tokenConfig';
import { Networks, isNetworkEVM, getNetworkDisplayName } from '../../helpers/networks';
import { OfframpingState } from '../../services/offrampingFlow';

export function createOfframpingPhaseMessage(offrampingState: OfframpingState, network: Networks): string {
  const inputToken = getInputTokenDetailsOrDefault(network, offrampingState.inputTokenType);
  const outputToken = getOutputTokenDetails(offrampingState.outputTokenType);
  const { phase } = offrampingState;

  if (phase === 'success') return 'Transaction completed successfully';

  const messages: Record<OfframpingPhase, string> = {
    prepareTransactions: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    squidRouter: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    pendulumFundEphemeral: isNetworkEVM(network)
      ? `Bridging ${inputToken.assetSymbol} from ${getNetworkDisplayName(network)} --> Moonbeam`
      : `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    executeMoonbeamXCM: `Transferring ${inputToken.assetSymbol} from Moonbeam --> Pendulum`,
    executeAssetHubXCM: `Bridging ${inputToken.assetSymbol} from AssetHub --> Pendulum`,
    subsidizePreSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    nablaApprove: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    nablaSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    subsidizePostSwap: `Swapping to ${outputToken.stellarAsset.code.string} on Vortex DEX`,
    executeSpacewalkRedeem: `Bridging ${outputToken.stellarAsset.code.string} to Stellar via Spacewalk`,
    pendulumCleanup: 'Transferring to local partner for bank transfer',
    stellarOfframp: 'Transferring to local partner for bank transfer',
    stellarCleanup: 'Transferring to local partner for bank transfer',
  };

  return messages[phase as OfframpingPhase];
}
