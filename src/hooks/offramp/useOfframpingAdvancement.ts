import { useEffect } from 'preact/hooks';
import { useConfig } from 'wagmi';

import { advanceOfframpingState } from '../../services/offrampingFlow';
import { EventStatus } from '../../components/GenericEvent';

import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useAssetHubNode } from '../../contexts/polkadotNode';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useEventsContext } from '../../contexts/events';

import { useOfframpActions, useOfframpState } from '../../stores/offrampStore';

interface AdvancementDeps {
  addEvent: (message: string, status: EventStatus) => void;
}

export const useOfframpingAdvancement = ({ addEvent }: AdvancementDeps) => {
  const { walletAccount } = usePolkadotWalletState();
  const { trackEvent } = useEventsContext();
  const wagmiConfig = useConfig();

  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  const offrampState = useOfframpState();
  const { updateOfframpHookStateFromState, setOfframpSigningPhase } = useOfframpActions();

  useEffect(() => {
    if (wagmiConfig.state.status !== 'connected') return;

    (async () => {
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
    })();

    // @todo: investigate and remove this
    // This effect has dependencies that are used inside the async function (assetHubNode, pendulumNode, walletAccount)
    // but we intentionally exclude them from the dependency array to prevent unnecessary re-renders.
    // These dependencies are stable and won't change during the lifecycle of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offrampState, trackEvent, updateOfframpHookStateFromState, wagmiConfig]);
};
