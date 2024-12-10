import { useState, useEffect, useCallback, StateUpdater } from 'preact/compat';
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { polygon } from 'wagmi/chains';
import Big from 'big.js';

import { EventStatus, GenericEvent } from '../../components/GenericEvent';
import { calculateTotalReceive } from '../../components/FeeCollapse';

import {
  getInputTokenDetails,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { OFFRAMPING_PHASE_SECONDS } from '../../pages/progress';

import { createTransactionEvent, useEventsContext } from '../../contexts/events';
import { useAssetHubNode, usePendulumNode } from '../../contexts/polkadotNode';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { useSiweContext } from '../../contexts/siwe';
import { useNetwork } from '../../contexts/network';

import { createStellarEphemeralSecret, fetchTomlValues, sep10, sep24First } from '../../services/anchor';
import {
  clearOfframpingState,
  recoverFromFailure,
  readCurrentState,
  advanceOfframpingState,
  OfframpingState,
} from '../../services/offrampingFlow';

import { useSEP24 } from './useSEP24';

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
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();

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
          from_asset: getInputTokenDetails(selectedNetwork, state.inputTokenType).assetSymbol,
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

  useEffect(() => {
    setOnSelectedNetworkChange(resetOfframpingState);
  }, [setOnSelectedNetworkChange, resetOfframpingState]);

  // Main submit handler. Offramp button.
  const handleOnSubmit = useCallback(
    (executionInput: ExecutionInput) => {
      const { inputTokenType, amountInUnits, outputTokenType, offrampAmount, setInitializeFailed } = executionInput;

      if (offrampingStarted || offrampingState !== undefined) {
        setIsInitiating(false);
        return;
      }

      (async () => {
        // If we already are on the polygon chain, we don't need to switch and this will be a no-op
        switchChain({ chainId: polygon.id });

        setOfframpingStarted(true);
        trackEvent({
          event: 'transaction_confirmation',
          from_asset: getInputTokenDetails(selectedNetwork, inputTokenType).assetSymbol,
          to_asset: OUTPUT_TOKEN_CONFIG[outputTokenType].stellarAsset.code.string,
          from_amount: amountInUnits,
          to_amount: calculateTotalReceive(offrampAmount, OUTPUT_TOKEN_CONFIG[outputTokenType]),
        });

        try {
          const stellarEphemeralSecret = createStellarEphemeralSecret();

          const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];
          const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl!);

          const { token: sep10Token, sep10Account } = await sep10(
            tomlValues,
            stellarEphemeralSecret,
            outputTokenType,
            address,
            checkAndWaitForSignature,
            forceRefreshAndWaitForSignature,
            addEvent,
          );

          const anchorSessionParams = {
            token: sep10Token,
            tomlValues: tomlValues,
            tokenConfig: outputToken,
            offrampAmount: offrampAmount.toFixed(2, 0),
          };
          setExecutionInput({
            ...executionInput,
            stellarEphemeralSecret,
          });
          setAnchorSessionParams(anchorSessionParams);

          const fetchAndUpdateSep24Url = async () => {
            const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, outputTokenType);
            const url = new URL(firstSep24Response.url);
            url.searchParams.append('callback', 'postMessage');
            firstSep24Response.url = url.toString();
            setFirstSep24Response(firstSep24Response);

            console.log('SEP24 url:', firstSep24Response.url);
          };

          const executeFinishInitialState = async () => {
            try {
              await fetchAndUpdateSep24Url();
            } catch (error) {
              console.error('Some error occurred finalizing the initial state of the offramping process', error);
              setInitializeFailed(true);
              setOfframpingStarted(false);
              cleanSep24FirstVariables();
            }
          };

          firstSep24IntervalRef.current = window.setInterval(fetchAndUpdateSep24Url, 20000);
          executeFinishInitialState().finally(() => setIsInitiating(false));
        } catch (error) {
          console.error('Some error occurred initializing the offramping process', error);
          setInitializeFailed(true);
          setOfframpingStarted(false);
          setIsInitiating(false);
        }
      })();
    },
    [
      offrampingStarted,
      offrampingState,
      switchChain,
      trackEvent,
      selectedNetwork,
      address,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setExecutionInput,
      setAnchorSessionParams,
      firstSep24IntervalRef,
      setFirstSep24Response,
      cleanSep24FirstVariables,
    ],
  );

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
