import { useEffect, useRef } from 'preact/hooks';
import { useConfig } from 'wagmi';

import { advanceOfframpingState } from '../../services/offrampingFlow';
import { EventStatus } from '../../components/GenericEvent';

import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEventsContext } from '../../contexts/events';

import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';
import { isNetworkEVM, useNetwork } from '../../contexts/network';

interface AdvancementDeps {
  addEvent: (message: string, status: EventStatus) => void;
}

export const useOfframpAdvancement = ({ addEvent }: AdvancementDeps) => {
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
          console.error('Polkadot nodes not initialized');
          return;
        }

        const nextState = await advanceOfframpingState(offrampState, {
          renderEvent: addEvent,
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
  ]);
};
