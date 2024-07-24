import { useState, useEffect, useCallback } from 'react';

// Configs, Types, constants
import { createStellarEphemeralSecret, sep24First } from '../services/anchor';
import { ExecutionInput } from '../types';
import { OUTPUT_TOKEN_CONFIG } from '../constants/tokenConfig';

import { fetchTomlValues, sep10, sep24Second } from '../services/anchor';
// Utils
import { stringifyBigWithSignificantDecimals } from '../helpers/contracts';
import { useConfig } from 'wagmi';
import { OfframpingPhase, advanceOfframpingState, constructInitialState } from '../services/offrampingFlow';
import { EventStatus, GenericEvent } from '../components/GenericEvent';
import Big from 'big.js';

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
  const [offrampingPhase, setOfframpingPhase] = useState<OfframpingPhase | undefined>(undefined);
  const wagmiConfig = useConfig();

  const [events, setEvents] = useState<GenericEvent[]>([]);

  const addEvent = (message: string, status: EventStatus) => {
    console.log('Add event', message, status);
    setEvents((prevEvents) => [...prevEvents, { value: message, status }]);
  };

  // Main submit handler. Offramp button.
  const handleOnSubmit = useCallback(
    ({ inputTokenType, outputTokenType, amountInUnits, minAmountOutUnits }: ExecutionInput) => {
      if (offrampingStarted || offrampingPhase !== undefined) return;

      (async () => {
        const stellarEphemeralSecret = createStellarEphemeralSecret();

        const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];
        const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl!);

        const truncatedAmountToOfframp = stringifyBigWithSignificantDecimals(Big(minAmountOutUnits), 2);

        const sep10Token = await sep10(tomlValues, stellarEphemeralSecret, addEvent);

        setOfframpingStarted(true);

        const anchorSessionParams = {
          token: sep10Token,
          tomlValues: tomlValues,
          tokenConfig: outputToken,
          offrampAmount: truncatedAmountToOfframp,
        };
        const firstSep24Response = await sep24First(anchorSessionParams);
        console.log('sep24 url:', firstSep24Response.url);

        const secondSep24Response = await sep24Second(firstSep24Response, anchorSessionParams!);

        const initialState = await constructInitialState({
          inputTokenType,
          outputTokenType,
          amountIn: amountInUnits,
          amountOut: minAmountOutUnits,
          sepResult: secondSep24Response,
        });

        setOfframpingPhase(initialState?.phase);
      })();
    },
    [],
  );

  useEffect(() => {
    if (offrampingPhase === undefined) return;

    (async () => {
      const nextState = await advanceOfframpingState({ renderEvent: addEvent, wagmiConfig });
      setOfframpingPhase(nextState?.phase);
    })();
  }, [offrampingPhase]);

  return {
    handleOnSubmit,
  };
};
