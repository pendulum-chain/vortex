import { MutableRefObject, useCallback } from 'preact/compat';
import { polygon } from 'wagmi/chains';
import { useAccount, useSwitchChain } from 'wagmi';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';

import { calculateTotalReceive } from '../../components/FeeCollapse';
import { getInputTokenDetails, OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import {
  createStellarEphemeralSecret,
  fetchTomlValues,
  IAnchorSessionParams,
  ISep24Intermediate,
  sep10,
  sep24First,
} from '../../services/anchor';

import { OfframpingState } from '../../services/offrampingFlow';
import { ExtendedExecutionInput } from './useSEP24/useSEP24State';
import { ExecutionInput } from './useSEP24';

interface UseSubmitOfframpProps {
  firstSep24IntervalRef: MutableRefObject<number | undefined>;
  setFirstSep24Response: (response: ISep24Intermediate | undefined) => void;
  setExecutionInput: (input: ExtendedExecutionInput | undefined) => void;
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  cleanSep24FirstVariables: () => void;
  offrampingStarted: boolean;
  offrampingState: OfframpingState | undefined;
  setOfframpingStarted: (started: boolean) => void;
  setIsInitiating: (isInitiating: boolean) => void;
}

export const useSubmitOfframp = ({
  firstSep24IntervalRef,
  setFirstSep24Response,
  setExecutionInput,
  setAnchorSessionParams,
  cleanSep24FirstVariables,
  offrampingStarted,
  offrampingState,
  setOfframpingStarted,
  setIsInitiating,
}: UseSubmitOfframpProps) => {
  const { selectedNetwork } = useNetwork();
  const { switchChain } = useSwitchChain();
  const { trackEvent } = useEventsContext();
  const { address } = useAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();

  const addEvent = (message: string, status: string) => {
    console.log('Add event', message, status);
  };

  return useCallback(
    (executionInput: ExecutionInput) => {
      const { inputTokenType, amountInUnits, outputTokenType, offrampAmount, setInitializeFailed } = executionInput;

      if (offrampingStarted || offrampingState !== undefined) {
        setIsInitiating(false);
        return;
      }

      (async () => {
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
            tomlValues,
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
          };

          firstSep24IntervalRef.current = window.setInterval(fetchAndUpdateSep24Url, 20000);

          try {
            await fetchAndUpdateSep24Url();
          } catch (error) {
            console.error('Error finalizing the initial state of the offramping process', error);
            setInitializeFailed(true);
            setOfframpingStarted(false);
            cleanSep24FirstVariables();
          } finally {
            setIsInitiating(false);
          }
        } catch (error) {
          console.error('Error initializing the offramping process', error);
          setInitializeFailed(true);
          setOfframpingStarted(false);
          setIsInitiating(false);
        }
      })();
    },
    [
      offrampingStarted,
      offrampingState,
      setIsInitiating,
      switchChain,
      setOfframpingStarted,
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
};
