import { useEffect } from 'react';
import { useConfig } from 'wagmi';

import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEventsContext } from '../../contexts/events';

import { useOfframpActions } from '../../stores/offrampStore';
import { ExecutionContext } from '../../services/offrampingFlow';

// This hook is now the bridge between the offramp flow loop, and the context
// that may update during the flow.
export const useOfframpAdvancement = () => {
  const { updateFlowContext, setOfframpSigningPhase } = useOfframpActions();
  const wagmiConfig = useConfig();
  const { trackEvent } = useEventsContext();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();
  const { walletAccount } = usePolkadotWalletState();

  useEffect(() => {
    if (!pendulumNode || !assetHubNode) {
      return;
    }

    const context: ExecutionContext = {
      wagmiConfig,
      setOfframpSigningPhase,
      trackEvent,
      pendulumNode,
      assetHubNode,
      walletAccount,
    };
    updateFlowContext(context);
  }, [wagmiConfig, trackEvent, pendulumNode, assetHubNode, walletAccount, updateFlowContext]);
};
