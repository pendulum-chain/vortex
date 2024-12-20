import { useState, useEffect, useCallback, StateUpdater } from 'preact/compat';
import { useConfig } from 'wagmi';
import Big from 'big.js';

import { EventStatus, GenericEvent } from '../../components/GenericEvent';

import { getInputTokenDetailsOrDefault, InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { OFFRAMPING_PHASE_SECONDS } from '../../pages/progress';

import { createTransactionEvent, useEventsContext } from '../../contexts/events';
import { useAssetHubNode, usePendulumNode } from '../../contexts/polkadotNode';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useNetwork } from '../../contexts/network';

import {
  clearOfframpingState,
  recoverFromFailure,
  readCurrentState,
  advanceOfframpingState,
  OfframpingState,
} from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';
import { useSubmitOfframp } from './useSubmitOfframp';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

export const useMainProcess = () => {
  const [offrampingStarted, setOfframpingStarted] = useState<boolean>(false);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [offrampingState, setOfframpingState] = useState<OfframpingState | undefined>(undefined);
  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  const { selectedNetwork, setOnSelectedNetworkChange } = useNetwork();
  const { walletAccount } = usePolkadotWalletState();

  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  const wagmiConfig = useConfig();
  const { trackEvent, resetUniqueEvents } = useEventsContext();

  const [, setEvents] = useState<GenericEvent[]>([]);
  const {
    firstSep24IntervalRef,
    firstSep24Response,
    setFirstSep24Response,
    setExecutionInput,
    setAnchorSessionParams,
    cleanSep24FirstVariables,
    handleOnAnchorWindowOpen: sep24HandleOnAnchorWindowOpen,
  } = useSEP24();

  const handleOnSubmit = useSubmitOfframp({
    firstSep24IntervalRef,
    setFirstSep24Response,
    setExecutionInput,
    setAnchorSessionParams,
    cleanSep24FirstVariables,
    offrampingStarted,
    offrampingState,
    setOfframpingStarted,
    setIsInitiating,
  });

  const updateHookStateFromState = useCallback(
    (state: OfframpingState | undefined) => {
      if (state === undefined || state.phase === 'success' || state.failure !== undefined) {
        setSigningPhase(undefined);
      }

      setOfframpingState(state);

      if (state?.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state, selectedNetwork));
      } else if (state?.failure !== undefined) {
        const currentPhase = state?.phase;
        const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(currentPhase);

        trackEvent({
          ...createTransactionEvent('transaction_failure', state, selectedNetwork),
          event: 'transaction_failure',
          phase_name: currentPhase,
          phase_index: currentPhaseIndex,
          from_asset: getInputTokenDetailsOrDefault(selectedNetwork, state.inputTokenType).assetSymbol,
          error_message: state.failure.message,
        });
      }
    },
    [trackEvent, selectedNetwork],
  );

  useEffect(() => {
    const state = readCurrentState();
    updateHookStateFromState(state);
  }, [updateHookStateFromState]);

  const addEvent = (message: string, status: EventStatus) => {
    console.log('Add event', message, status);
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
  };

  const resetOfframpingState = useCallback(() => {
    setOfframpingState(undefined);
    setOfframpingStarted(false);
    setIsInitiating(false);
    setAnchorSessionParams(undefined);
    setFirstSep24Response(undefined);
    setExecutionInput(undefined);
    cleanSep24FirstVariables();
    clearOfframpingState();
    setSigningPhase(undefined);
  }, [
    setOfframpingState,
    setOfframpingStarted,
    setIsInitiating,
    setAnchorSessionParams,
    setFirstSep24Response,
    setExecutionInput,
    cleanSep24FirstVariables,
    setSigningPhase,
  ]);

  // useEffect(() => {
  //   setOnSelectedNetworkChange(resetOfframpingState);
  // }, [setOnSelectedNetworkChange, resetOfframpingState]);

  const handleOnAnchorWindowOpen = useCallback(async () => {
    if (!pendulumNode) {
      console.error('Pendulum node not initialized');
      return;
    }

    await sep24HandleOnAnchorWindowOpen(selectedNetwork, setOfframpingStarted, updateHookStateFromState, pendulumNode);
  }, [selectedNetwork, setOfframpingStarted, updateHookStateFromState, pendulumNode, sep24HandleOnAnchorWindowOpen]);

  const finishOfframping = useCallback(() => {
    (async () => {
      clearOfframpingState();
      resetUniqueEvents();
      setOfframpingStarted(false);
      updateHookStateFromState(undefined);
    })();
  }, [updateHookStateFromState, resetUniqueEvents]);

  const continueFailedFlow = useCallback(() => {
    const nextState = recoverFromFailure(offrampingState);
    updateHookStateFromState(nextState);
  }, [updateHookStateFromState, offrampingState]);

  useEffect(() => {
    //if (wagmiConfig.state.status !== 'connected') return;

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
  }, [
    offrampingState,
    trackEvent,
    updateHookStateFromState,
    wagmiConfig,
    pendulumNode,
    assetHubNode,
    wagmiConfig.state.status,
  ]);

  const maybeCancelSep24First = useCallback(() => {
    if (firstSep24IntervalRef.current !== undefined) {
      setOfframpingStarted(false);
      cleanSep24FirstVariables();
    }
  }, [firstSep24IntervalRef, cleanSep24FirstVariables]);

  return {
    handleOnSubmit,
    firstSep24ResponseState: firstSep24Response,
    offrampingState,
    offrampingStarted,
    isInitiating,
    setIsInitiating,
    finishOfframping,
    continueFailedFlow,
    handleOnAnchorWindowOpen,
    signingPhase,
    maybeCancelSep24First,
  };
};
