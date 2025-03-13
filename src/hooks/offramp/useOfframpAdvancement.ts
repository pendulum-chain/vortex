import { useEffect, useRef } from 'react';
import { useConfig } from 'wagmi';

import { advanceOfframpingState } from '../../services/offrampingFlow';

import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEventsContext } from '../../contexts/events';

import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';
import { useNetwork } from '../../contexts/network';
import { isNetworkEVM } from '../../helpers/networks';
import { storageService } from '../../services/storage/local';

export const useOfframpAdvancement = () => {
  const { walletAccount } = usePolkadotWalletState();
  const { trackEvent } = useEventsContext();
  const wagmiConfig = useConfig();

  const { selectedNetwork } = useNetwork();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  const offrampState = useOfframpState();
  const { updateOfframpHookStateFromState, setOfframpSigningPhase } = useOfframpActions();

  const isProcessingAdvance = useRef(false);

  useEffect(() => {
    if (isNetworkEVM(selectedNetwork) && wagmiConfig.state.status !== 'connected') return;
    if (!isNetworkEVM(selectedNetwork) && !walletAccount?.address) return;

    (async () => {
      try {
        if (isProcessingAdvance.current) return;
        isProcessingAdvance.current = true;
        if (!pendulumNode || !assetHubNode) {
          return;
        }

        const nextState = await advanceOfframpingState(offrampState, {
          wagmiConfig,
          setOfframpSigningPhase,
          trackEvent,
          pendulumNode,
          assetHubNode,
          walletAccount,
        });

        if (JSON.stringify(offrampState) !== JSON.stringify(nextState)) {
          updateOfframpHookStateFromState(nextState);
        }
      } catch (error) {
        console.error('Error advancing offramping state:', error);
      } finally {
        isProcessingAdvance.current = false;
      }
    })();
  }, [
    offrampState,
    trackEvent,
    updateOfframpHookStateFromState,
    wagmiConfig.state.status,
    selectedNetwork,
    pendulumNode,
    assetHubNode,
    walletAccount?.address,
    wagmiConfig,
    walletAccount,
    setOfframpSigningPhase,
  ]);
};
