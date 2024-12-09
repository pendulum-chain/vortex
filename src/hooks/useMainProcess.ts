import { useState, useEffect, useCallback, useRef, StateUpdater } from 'preact/compat';

// Configs, Types, constants
import { createStellarEphemeralSecret, sep24First } from '../services/anchor';
import { getInputTokenDetails, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../constants/tokenConfig';

import { fetchTomlValues, sep10, sep24Second } from '../services/anchor';
// Utils
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { polygon } from 'wagmi/chains';
import {
  clearOfframpingState,
  recoverFromFailure,
  readCurrentState,
  advanceOfframpingState,
  constructInitialState,
  OfframpingState,
} from '../services/offrampingFlow';
import { EventStatus, GenericEvent } from '../components/GenericEvent';
import Big from 'big.js';
import { createTransactionEvent, useEventsContext } from '../contexts/events';
import { showToast, ToastMessage } from '../helpers/notifications';
import { IAnchorSessionParams, ISep24Intermediate } from '../services/anchor';
import { OFFRAMPING_PHASE_SECONDS } from '../pages/progress';
import { useNetwork } from '../contexts/network';

import { useSiweContext } from '../contexts/siwe';
import { calculateTotalReceive } from '../components/FeeCollapse';
import { useAssetHubNode, usePendulumNode } from '../contexts/polkadotNode';
import { usePolkadotWalletState } from '../contexts/polkadotWallet';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
  setInitializeFailed: StateUpdater<boolean>;
}

type ExtendedExecutionInput = ExecutionInput & { stellarEphemeralSecret: string };

export const useMainProcess = () => {
  const [offrampingStarted, setOfframpingStarted] = useState<boolean>(false);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [offrampingState, setOfframpingState] = useState<OfframpingState | undefined>(undefined);
  const [anchorSessionParamsState, setAnchorSessionParams] = useState<IAnchorSessionParams | undefined>(undefined);
  const [firstSep24ResponseState, setFirstSep24Response] = useState<ISep24Intermediate | undefined>(undefined);
  const [executionInputState, setExecutionInputState] = useState<ExtendedExecutionInput | undefined>(undefined);
  const { selectedNetwork } = useNetwork();
  const { walletAccount } = usePolkadotWalletState();

  const { apiComponents: pendulumNode } = usePendulumNode();
  const { apiComponents: assetHubNode } = useAssetHubNode();

  const sep24FirstIntervalRef = useRef<number | undefined>(undefined);

  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  const wagmiConfig = useConfig();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { trackEvent, resetUniqueEvents } = useEventsContext();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();

  const [, setEvents] = useState<GenericEvent[]>([]);

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

  const cleanSep24FirstVariables = useCallback(() => {
    if (sep24FirstIntervalRef.current !== undefined) {
      // stop executing the function, and reset the ref variable.
      clearInterval(sep24FirstIntervalRef.current);
      sep24FirstIntervalRef.current = undefined;
      setFirstSep24Response(undefined);
      setExecutionInputState(undefined);
      setAnchorSessionParams(undefined);
    }
  }, [setFirstSep24Response, setExecutionInputState, setAnchorSessionParams]);

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
          setExecutionInputState({
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

          sep24FirstIntervalRef.current = window.setInterval(fetchAndUpdateSep24Url, 20000);
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
      selectedNetwork,
      offrampingStarted,
      offrampingState,
      switchChain,
      trackEvent,
      address,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      cleanSep24FirstVariables,
    ],
  );

  const handleOnAnchorWindowOpen = useCallback(async () => {
    if (
      firstSep24ResponseState === undefined ||
      anchorSessionParamsState === undefined ||
      executionInputState === undefined
    ) {
      return;
    }
    trackEvent({
      event: 'kyc_started',
      from_asset: getInputTokenDetails(selectedNetwork, executionInputState.inputTokenType).assetSymbol,
      to_asset: OUTPUT_TOKEN_CONFIG[executionInputState.outputTokenType].stellarAsset.code.string,
      from_amount: executionInputState.amountInUnits,
      to_amount: calculateTotalReceive(
        executionInputState.offrampAmount,
        OUTPUT_TOKEN_CONFIG[executionInputState.outputTokenType],
      ),
    });

    // stop fetching new sep24 url's and clean session variables from the state to be safe.
    // We want to avoid session variables used in defferent sessions.
    const firstSep24Response = firstSep24ResponseState;
    const anchorSessionParams = anchorSessionParamsState;
    cleanSep24FirstVariables();

    let secondSep24Response;
    try {
      secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);
      console.log('secondSep24Response', secondSep24Response);

      // Check if the amount entered in the KYC UI matches the one we expect
      if (!Big(secondSep24Response.amount).eq(executionInputState.offrampAmount)) {
        setOfframpingStarted(false);
        console.error("The amount entered in the KYC UI doesn't match the one we expect. Stopping offramping process.");
        showToast(ToastMessage.AMOUNT_MISMATCH);
        return;
      }
    } catch (error) {
      console.error('Some error occurred on second part of sep24 process', error);
      return setOfframpingStarted(false);
    }

    try {
      if (!pendulumNode) {
        throw new Error('Pendulum node not initialized');
      }

      const initialState = await constructInitialState({
        sep24Id: firstSep24Response.id,
        stellarEphemeralSecret: executionInputState.stellarEphemeralSecret,
        inputTokenType: executionInputState.inputTokenType,
        outputTokenType: executionInputState.outputTokenType,
        amountIn: executionInputState.amountInUnits,
        amountOut: executionInputState.offrampAmount,
        sepResult: secondSep24Response,
        network: selectedNetwork,
        pendulumNode,
      });

      console.log('\x1b[34m1>>>>> initialState', initialState, '\x1b[0m');

      trackEvent(createTransactionEvent('kyc_completed', initialState, selectedNetwork));
      updateHookStateFromState(initialState);
    } catch (error) {
      console.error('Some error occurred constructing initial state', error);
      setOfframpingStarted(false);
    }
  }, [
    firstSep24ResponseState,
    anchorSessionParamsState,
    executionInputState,
    updateHookStateFromState,
    trackEvent,
    selectedNetwork,
    cleanSep24FirstVariables,
    pendulumNode,
  ]);

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
    console.log('\x1b[35m3>>>>> recoveredState', nextState, '\x1b[0m');
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
    // This effect has dependencies that are used inside the async function (pendulumNode, assetHubNode, walletAccount)
    // but we intentionally exclude them from the dependency array to prevent unnecessary re-renders.
    // These dependencies are stable and won't change during the lifecycle of this hook.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [offrampingState, trackEvent, updateHookStateFromState, wagmiConfig]);

  const maybeCancelSep24First = useCallback(() => {
    // Check if the SEP-24 second process is in the waiting state (user has not opened window yet)
    // only then we allow cancelling.
    if (sep24FirstIntervalRef.current !== undefined) {
      setOfframpingStarted(false);
      cleanSep24FirstVariables();
    }
  }, [setOfframpingStarted, cleanSep24FirstVariables]);

  return {
    handleOnSubmit,
    firstSep24ResponseState,
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
