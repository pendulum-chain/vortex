import { useState, useEffect, useCallback } from 'preact/compat';

// Configs, Types, constants
import { createStellarEphemeralSecret, sep24First } from '../services/anchor';
import { ExecutionInput } from '../types';
import { INPUT_TOKEN_CONFIG, OUTPUT_TOKEN_CONFIG } from '../constants/tokenConfig';

import { fetchTomlValues, sep10, sep24Second } from '../services/anchor';
// Utils
import { stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { useConfig } from 'wagmi';
import {
  FinalOfframpingPhase,
  OfframpingPhase,
  OfframpingState,
  advanceOfframpingState,
  clearOfframpingState,
  constructInitialState,
  readCurrentState,
} from '../services/offrampingFlow';
import { EventStatus, GenericEvent } from '../components/GenericEvent';
import Big from 'big.js';
import { createTransactionEvent, useEventsContext } from '../contexts/events';
import { storageService } from '../services/storage/local';
import { OFFRAMPING_STATE_LOCAL_STORAGE_KEY } from '../services/offrampingFlow';

export type SigningPhase = 'started' | 'approved' | 'signed' | 'finished';

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
  const [offrampingPhase, setOfframpingPhase] = useState<OfframpingPhase | FinalOfframpingPhase | undefined>(undefined);
  const [sep24Url, setSep24Url] = useState<string | undefined>(undefined);
  const [sep24Id, setSep24Id] = useState<string | undefined>(undefined);

  const [signingPhase, setSigningPhase] = useState<SigningPhase | undefined>(undefined);

  const wagmiConfig = useConfig();
  const { trackEvent } = useEventsContext();

  const [, setEvents] = useState<GenericEvent[]>([]);

  const updateHookStateFromState = useCallback(
    (state: OfframpingState | undefined) => {
      if (state?.phase === 'success' || state?.phase === 'failure') {
        setSigningPhase(undefined);
      }
      setOfframpingPhase(state?.phase);
      setSep24Id(state?.sep24Id);

      if (state?.phase === 'success') {
        trackEvent(createTransactionEvent('transaction_success', state));
      } else if (state?.phase === 'failure') {
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

  // Main submit handler. Offramp button.
  const handleOnSubmit = useCallback(
    ({ inputTokenType, outputTokenType, amountInUnits, minAmountOutUnits }: ExecutionInput) => {
      if (offrampingStarted || offrampingPhase !== undefined) return;

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
          const firstSep24Response = await sep24First(anchorSessionParams);
          console.log('sep24 url:', firstSep24Response.url);
          setSep24Url(firstSep24Response.url);

          const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams!);

          console.log('secondSep24Response', secondSep24Response);

          const initialState = await constructInitialState({
            sep24Id: firstSep24Response.id,
            inputTokenType,
            outputTokenType,
            amountIn: amountInUnits,
            amountOut: minAmountOutUnits,
            sepResult: secondSep24Response,
          });

          trackEvent(createTransactionEvent('kyc_completed', initialState));

          updateHookStateFromState(initialState);

        } catch (error) {
          const initialStateFailure = await constructInitialState({
            sep24Id: 'null',
            inputTokenType,
            outputTokenType,
            amountIn: amountInUnits,
            amountOut: minAmountOutUnits,
            sepResult: {
              amount: '0',
              memo: '0',
              memoType: '0',
              offrampingAccount: '0',
            },
          });
          storageService.set(OFFRAMPING_STATE_LOCAL_STORAGE_KEY, initialStateFailure);
          setOfframpingPhase('failure');

          console.error('Some error occurred initializing the offramping process', error);
        }
      })();
    },
    [offrampingPhase, offrampingStarted, trackEvent, updateHookStateFromState, setOfframpingPhase],
  );

  const finishOfframping = useCallback(() => {
    (async () => {
      await clearOfframpingState();
      setOfframpingStarted(false);
      updateHookStateFromState(undefined);
    })();
  }, [updateHookStateFromState]);

  useEffect(() => {
    (async () => {
      const nextState = await advanceOfframpingState({ renderEvent: addEvent, wagmiConfig, setSigningPhase });
      updateHookStateFromState(nextState);
    })();
  }, [offrampingPhase, updateHookStateFromState, wagmiConfig]);

  const resetSep24Url = () => setSep24Url(undefined);

  return {
    setOfframpingPhase,
    handleOnSubmit,
    sep24Url,
    offrampingPhase,
    offrampingStarted,
    sep24Id,
    finishOfframping,
    resetSep24Url,
    signingPhase,
  };
};
