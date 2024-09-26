import { useState, useEffect, useCallback, useRef } from 'preact/compat';

// Configs, Types, constants
import { createStellarEphemeralSecret, sep24First } from '../services/anchor';
import { ExecutionInput } from '../types';
import { INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG } from '../constants/tokenConfig';

import { fetchTomlValues, sep10, sep24Second } from '../services/anchor';
// Utils
import { useConfig } from 'wagmi';
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
import { stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { IAnchorSessionParams, ISep24Intermediate } from '../services/anchor';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';
type ExtendedExecutionInput = ExecutionInput & { truncatedAmountToOfframp: string; stellarEphemeralSecret: string };

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
  const [offrampingState, setOfframpingState] = useState<OfframpingState | undefined>(undefined);
  const [anchorSessionParams, setAnchorSessionParams] = useState<IAnchorSessionParams | undefined>(undefined);
  const [firstSep24ResponseState, setFirstSep24Response] = useState<ISep24Intermediate | undefined>(undefined);
  const [executionInput, setExecutionInput] = useState<ExtendedExecutionInput | undefined>(undefined);

  const sep24FirstIntervalRef = useRef<number | undefined>(undefined);

  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  const wagmiConfig = useConfig();
  const { trackEvent, resetUniqueEvents } = useEventsContext();

  const [, setEvents] = useState<GenericEvent[]>([]);

  const updateHookStateFromState = useCallback(
    (state: OfframpingState | undefined) => {
      if (state?.phase === 'success' || state?.isFailure === true) {
        setSigningPhase(undefined);
      }
      setOfframpingState(state);

      if (state?.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state));
      } else if (state?.isFailure === true) {
        trackEvent(createTransactionEvent('transaction_failure', state));
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
    }
  };

  // Main submit handler. Offramp button.
  const handleOnSubmit = useCallback(
    ({ inputTokenType, outputTokenType, amountInUnits, minAmountOutUnits }: ExecutionInput) => {
      if (offrampingStarted || offrampingState !== undefined) return;

      (async () => {
        setOfframpingStarted(true);
        trackEvent({
          event: 'transaction_confirmation',
          from_asset: INPUT_TOKEN_CONFIG[inputTokenType].assetSymbol,
          to_asset: OUTPUT_TOKEN_CONFIG[outputTokenType].stellarAsset.code.string,
          from_amount: amountInUnits,
          to_amount: Big(minAmountOutUnits).round(2, 0).toFixed(2, 0),
        });

        try {
          const stellarEphemeralSecret = createStellarEphemeralSecret();

          const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];
          const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl!);

          const truncatedAmountToOfframp = stringifyBigWithSignificantDecimals(Big(minAmountOutUnits), 2);

          const sep10Token = await sep10(tomlValues, stellarEphemeralSecret, addEvent);

          const anchorSessionParams = {
            token: sep10Token,
            tomlValues: tomlValues,
            tokenConfig: outputToken,
            offrampAmount: truncatedAmountToOfframp,
          };
          setExecutionInput({
            inputTokenType,
            outputTokenType,
            amountInUnits,
            minAmountOutUnits,
            truncatedAmountToOfframp,
            stellarEphemeralSecret,
          });
          setAnchorSessionParams(anchorSessionParams);

          const fetchAndUpdateSep24Url = async () => {
            const firstSep24Response = await sep24First(anchorSessionParams);
            setFirstSep24Response(firstSep24Response);
            console.log('SEP24 url:', firstSep24Response.url);
          };

          const executeFinishInitialState = async () => {
            try {
              await fetchAndUpdateSep24Url();
              throw new Error('This is a test error');
            } catch (error) {
              console.error('Some error occurred finalizing the initial state of the offramping process', error);
              setOfframpingStarted(false);
              cleanSep24FirstVariables();
            }
          };

          sep24FirstIntervalRef.current = window.setInterval(fetchAndUpdateSep24Url, 20000);
          executeFinishInitialState();
        } catch (error) {
          console.error('Some error occurred initializing the offramping process', error);
          setOfframpingStarted(false);
        }
      })();
    },
    [offrampingState, offrampingStarted, trackEvent, updateHookStateFromState],
  );

  const handleOnAnchorWindowOpen = useCallback(async () => {
    if (firstSep24ResponseState === undefined || anchorSessionParams === undefined || executionInput === undefined) {
      return;
    }

    // stop fetching new sep24 url's and
    // for UI button on main swap screen
    let firstSep24Response = firstSep24ResponseState;
    cleanSep24FirstVariables();

    const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams);

    console.log('secondSep24Response', secondSep24Response);

    // Check if the amount entered in the KYC UI matches the one we expect
    if (!Big(secondSep24Response.amount).eq(executionInput.truncatedAmountToOfframp)) {
      setOfframpingStarted(false);
      console.error("The amount entered in the KYC UI doesn't match the one we expect. Stopping offramping process.");
      showToast(ToastMessage.AMOUNT_MISMATCH);
      return;
    }

    const initialState = await constructInitialState({
      sep24Id: firstSep24Response.id,
      stellarEphemeralSecret: executionInput.stellarEphemeralSecret,
      inputTokenType: executionInput.inputTokenType,
      outputTokenType: executionInput.outputTokenType,
      amountIn: executionInput.amountInUnits,
      amountOut: executionInput.minAmountOutUnits,
      sepResult: secondSep24Response,
    });

    trackEvent(createTransactionEvent('kyc_completed', initialState));
    updateHookStateFromState(initialState);
  }, [firstSep24ResponseState, anchorSessionParams, executionInput, updateHookStateFromState, trackEvent]);

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
      });

      if (offrampingState !== nextState) updateHookStateFromState(nextState);
    })();
  }, [offrampingState, updateHookStateFromState, wagmiConfig]);

  return {
    handleOnSubmit,
    firstSep24ResponseState,
    offrampingState,
    offrampingStarted,
    finishOfframping,
    continueFailedFlow,
    handleOnAnchorWindowOpen,
    signingPhase,
  };
};
