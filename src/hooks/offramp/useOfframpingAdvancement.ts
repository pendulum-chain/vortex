import { StateUpdater } from 'preact/hooks';

import { useAssetHubNode } from '../../contexts/polkadotNode';

import { EventStatus } from '../../components/GenericEvent';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { advanceOfframpingState, OfframpingState } from '../../services/offrampingFlow';
import { SigningPhase } from './useMainProcess';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useConfig } from 'wagmi';
import { useEffect } from 'preact/hooks';
import { useEventsContext } from '../../contexts/events';

export const useOfframpingAdvancement = (deps: {
  offrampingState: OfframpingState | undefined;
  updateHookStateFromState: (state: OfframpingState | undefined) => void;
  addEvent: (message: string, status: EventStatus) => void;
  setSigningPhase: StateUpdater<SigningPhase | undefined>;
}) => {
  const { offrampingState, updateHookStateFromState, addEvent, setSigningPhase } = deps;
  const { trackEvent } = useEventsContext();
  const wagmiConfig = useConfig();
  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();
  const { walletAccount } = usePolkadotWalletState();

  useEffect(() => {
    if (wagmiConfig.state.status !== 'connected') return;

    (async () => {
      if (!pendulumNode || !assetHubNode) {
        console.error('Polkadot nodes not initialized');
        return;
      }

      const nextState = await advanceOfframpingState(offrampingState, {
        renderEvent: addEvent,
        wagmiConfig,
        setSigningPhase,
        trackEvent,
        pendulumNode,
        assetHubNode,
        walletAccount,
      });

      if (JSON.stringify(offrampingState) !== JSON.stringify(nextState)) {
        updateHookStateFromState(nextState);
      }
    })();
    // This effect has dependencies that are used inside the async function (assetHubNode, pendulumNode, walletAccount)
    // but we intentionally exclude them from the dependency array to prevent unnecessary re-renders.
    // These dependencies are stable and won't change during the lifecycle of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offrampingState, trackEvent, updateHookStateFromState, wagmiConfig]);
};
