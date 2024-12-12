import { useState, useEffect, useCallback, StateUpdater } from 'preact/compat';
import Big from 'big.js';

import { InputTokenType, OutputTokenType } from '../../constants/tokenConfig';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useNetwork } from '../../contexts/network';
import {
  clearOfframpingState,
  recoverFromFailure,
  readCurrentState,
  OfframpingState,
} from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';
import { useSubmitOfframp } from './useSubmitOfframp';
import { useOfframpingEvents } from './useOfframpingEvents';
import { useOfframpingReset } from './useOfframpingReset';
import { useOfframpingAdvancement } from './useOfframpingAdvancement';

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

  const { apiComponents: pendulumNode } = usePendulumNode();

  const { addEvent, trackOfframpingEvent, resetUniqueEvents } = useOfframpingEvents(selectedNetwork);

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
      trackOfframpingEvent(state);
    },
    [trackOfframpingEvent],
  );

  useEffect(() => {
    const state = readCurrentState();
    updateHookStateFromState(state);
  }, [updateHookStateFromState]);

  const resetOfframpingState = useOfframpingReset({
    setOfframpingState,
    setOfframpingStarted,
    setIsInitiating,
    setAnchorSessionParams,
    setFirstSep24Response,
    setExecutionInput,
    cleanSep24FirstVariables,
    setSigningPhase,
  });

  useEffect(() => {
    setOnSelectedNetworkChange(resetOfframpingState);
  }, [setOnSelectedNetworkChange, resetOfframpingState]);

  const handleOnAnchorWindowOpen = useCallback(async () => {
    if (!pendulumNode) {
      console.error('Pendulum node not initialized');
      return;
    }

    await sep24HandleOnAnchorWindowOpen(selectedNetwork, setOfframpingStarted, updateHookStateFromState, pendulumNode);
  }, [selectedNetwork, setOfframpingStarted, updateHookStateFromState, pendulumNode, sep24HandleOnAnchorWindowOpen]);

  const finishOfframping = useCallback(() => {
    (async () => {
      await clearOfframpingState();
      resetUniqueEvents();
      setOfframpingStarted(false);
      updateHookStateFromState(undefined);
    })();
  }, [updateHookStateFromState, resetUniqueEvents]);

  const continueFailedFlow = useCallback(() => {
    const nextState = recoverFromFailure(offrampingState);
    updateHookStateFromState(nextState);
  }, [updateHookStateFromState, offrampingState]);

  useOfframpingAdvancement({
    offrampingState,
    updateHookStateFromState,
    addEvent,
    setSigningPhase,
  });

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
