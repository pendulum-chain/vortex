import { useState, useEffect, useCallback, useRef } from 'preact/compat';

// Configs, Types, constants
import { createStellarEphemeralSecret, sep24First } from '../services/anchor';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../constants/tokenConfig';

import { fetchTomlValues, sep10, sep24Second } from '../services/anchor';
// Utils
import { useAccount, useConfig, useSwitchChain } from 'wagmi';
import { polygon } from 'wagmi/chains';
import {
  OfframpingState,
  advanceOfframpingState,
  clearOfframpingState,
  constructInitialState,
  readCurrentState,
  recoverFromFailure,
} from '../services/offrampingFlow';
import { EventStatus, GenericEvent } from '../components/GenericEvent';
import Big from 'big.js';
import { createTransactionEvent, useEventsContext } from '../contexts/events';
import { showToast, ToastMessage } from '../helpers/notifications';
import { IAnchorSessionParams, ISep24Intermediate } from '../services/anchor';
import { OFFRAMPING_PHASE_SECONDS } from '../pages/progress';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

export interface ExecutionInput {
  inputTokenType: InputTokenType;
  outputTokenType: OutputTokenType;
  amountInUnits: string;
  offrampAmount: Big;
}

type ExtendedExecutionInput = ExecutionInput & { stellarEphemeralSecret: string };

export const useMainProcess = () => {
  // EXAMPLE mocking states

  // Approval already performed (scenario: service shut down after sending approval but before getting it's confirmation)
  // let recoveryStatus = {
  //   approvalHash: '0xe2798e5c30915033e3d5aaecf2cb2704c31f0a68624013849729ac5c69f83048',
  //   swapHash: undefined,
  //   transactionRequest: {"routeType":"CALL_BRIDGE_CALL","target":"0xce16F69375520ab01377ce7B88f5BA8C48F8D666","data":"0x00","value":"511469868416439548","gasLimit":"556000","lastBaseFeePerGas":"3560652","maxFeePerGas":"1507121304","maxPriorityFeePerGas":"1500000000","gasPrice":"30003560652","requestId":"de321b5ab3f9989d67dab414b3556ece"}
  // }

  // storageService.set(storageKeys.SQUIDROUTER_RECOVERY_STATE, recoveryStatus );
  // storageService.set(storageKeys.OFFRAMP_STATUS, OperationStatus.Sep6Completed);

  const [offrampingStarted, setOfframpingStarted] = useState<boolean>(false);
  const [isInitiating, setIsInitiating] = useState<boolean>(false);
  const [offrampingState, setOfframpingState] = useState<OfframpingState | undefined>(undefined);
  const [anchorSessionParamsState, setAnchorSessionParams] = useState<IAnchorSessionParams | undefined>(undefined);
  const [firstSep24ResponseState, setFirstSep24Response] = useState<ISep24Intermediate | undefined>(undefined);
  const [executionInputState, setExecutionInputState] = useState<ExtendedExecutionInput | undefined>(undefined);

  const sep24FirstIntervalRef = useRef<number | undefined>(undefined);

  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  const wagmiConfig = useConfig();
  const { address } = useAccount();
  const { switchChain } = useSwitchChain();
  const { trackEvent, resetUniqueEvents } = useEventsContext();

  const [, setEvents] = useState<GenericEvent[]>([]);

  const updateHookStateFromState = useCallback(
    (state: OfframpingState | undefined) => {
      if (state === undefined || state.phase === 'success' || state.failure !== undefined) {
        setSigningPhase(undefined);
      }
      setOfframpingState(state);

      if (state?.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state));
      } else if (state?.failure !== undefined) {
        const currentPhase = state?.phase;
        const currentPhaseIndex = Object.keys(OFFRAMPING_PHASE_SECONDS).indexOf(currentPhase);

        trackEvent({
          ...createTransactionEvent('transaction_failure', state),
          event: 'transaction_failure',
          phase_name: currentPhase,
          phase_index: currentPhaseIndex,
        });
      }
    },
    [trackEvent],
  );

  useEffect(() => {
    const state = readCurrentState();
    updateHookStateFromState(state);
  }, [updateHookStateFromState]);

  const addEvent = (message: string, status: EventStatus) => {
    console.log('Add event', message, status);
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
  };

  const cleanSep24FirstVariables = () => {
    if (sep24FirstIntervalRef.current !== undefined) {
      // stop executing the function, and reset the ref variable.
      clearInterval(sep24FirstIntervalRef.current);
      sep24FirstIntervalRef.current = undefined;
      setFirstSep24Response(undefined);
      setExecutionInputState(undefined);
      setAnchorSessionParams(undefined);
    }
  };

  // Main submit handler. Offramp button.
  const handleOnSubmit = useCallback(
    (executionInput: ExecutionInput) => {
      const { inputTokenType, amountInUnits, outputTokenType, offrampAmount } = executionInput;

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
          from_asset: INPUT_TOKEN_CONFIG[inputTokenType].assetSymbol,
          to_asset: OUTPUT_TOKEN_CONFIG[outputTokenType].stellarAsset.code.string,
          from_amount: amountInUnits,
          to_amount: offrampAmount.toFixed(2, 0),
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
            const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, outputTokenType, address);
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
              setOfframpingStarted(false);
              cleanSep24FirstVariables();
            }
          };

          sep24FirstIntervalRef.current = window.setInterval(fetchAndUpdateSep24Url, 20000);
          executeFinishInitialState().finally(() => setIsInitiating(false));
        } catch (error) {
          console.error('Some error occurred initializing the offramping process', error);
          setOfframpingStarted(false);
          setIsInitiating(false);
        }
      })();
    },
    [offrampingStarted, offrampingState, switchChain, trackEvent, address],
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
      from_asset: INPUT_TOKEN_CONFIG[executionInputState.inputTokenType].assetSymbol,
      to_asset: OUTPUT_TOKEN_CONFIG[executionInputState.outputTokenType].stellarAsset.code.string,
      from_amount: executionInputState.amountInUnits,
      to_amount: executionInputState.offrampAmount.toFixed(2, 0),
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
      const initialState = await constructInitialState({
        sep24Id: firstSep24Response.id,
        stellarEphemeralSecret: executionInputState.stellarEphemeralSecret,
        inputTokenType: executionInputState.inputTokenType,
        outputTokenType: executionInputState.outputTokenType,
        amountIn: executionInputState.amountInUnits,
        amountOut: executionInputState.offrampAmount,
        sepResult: secondSep24Response,
      });

      trackEvent(createTransactionEvent('kyc_completed', initialState));
      updateHookStateFromState(initialState);
    } catch (error) {
      console.error('Some error occurred constructing initial state', error);
      setOfframpingStarted(false);
    }
  }, [firstSep24ResponseState, anchorSessionParamsState, executionInputState, updateHookStateFromState, trackEvent]);

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
    (async () => {
      const nextState = await advanceOfframpingState(offrampingState, {
        renderEvent: addEvent,
        wagmiConfig,
        setSigningPhase,
        trackEvent,
      });

      if (offrampingState !== nextState) updateHookStateFromState(nextState);
    })();
  }, [offrampingState, updateHookStateFromState, trackEvent, wagmiConfig]);

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
  };
};
