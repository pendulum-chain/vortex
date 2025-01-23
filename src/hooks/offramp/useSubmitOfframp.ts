import { useCallback } from 'react';
import { polygon } from 'wagmi/chains';
import { useSwitchChain } from 'wagmi';

import { getNetworkId, isNetworkEVM } from '../../helpers/networks';
import { useVortexAccount } from '../useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';

import { calculateTotalReceive } from '../../components/FeeCollapse';
import { getInputTokenDetailsOrDefault, OUTPUT_TOKEN_CONFIG } from '../../constants/tokenConfig';
import { createStellarEphemeralSecret, fetchTomlValues } from '../../services/stellar';

import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';

import { useOfframpActions, useOfframpStarted, useOfframpState } from '../../stores/offrampStore';
import { ExecutionInput } from './useMainProcess';
import { useSep24Actions } from '../../stores/sep24Store';

import { showToast, ToastMessage } from '../../helpers/notifications';

export const useSubmitOfframp = () => {
  const { selectedNetwork } = useNetwork();
  const { switchChainAsync, switchChain } = useSwitchChain();
  const { trackEvent } = useEventsContext();
  const { address } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();
  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const { setOfframpStarted, setOfframpInitiating } = useOfframpActions();
  const {
    setAnchorSessionParams,
    setExecutionInput,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();

  return useCallback(
    (executionInput: ExecutionInput) => {
      const { inputTokenType, amountInUnits, outputTokenType, offrampAmount, setInitializeFailed } = executionInput;

      if (offrampStarted || offrampState !== undefined) {
        setOfframpInitiating(false);
        return;
      }

      (async () => {
        switchChain({ chainId: polygon.id });
        setOfframpStarted(true);

        trackEvent({
          event: 'transaction_confirmation',
          from_asset: getInputTokenDetailsOrDefault(selectedNetwork, inputTokenType).assetSymbol,
          to_asset: OUTPUT_TOKEN_CONFIG[outputTokenType].stellarAsset.code.string,
          from_amount: amountInUnits,
          to_amount: calculateTotalReceive(offrampAmount, OUTPUT_TOKEN_CONFIG[outputTokenType]),
        });

        try {
          // For substrate, we only have AssetHub only now. Thus no need to change.
          if (isNetworkEVM(selectedNetwork)) {
            await switchChainAsync({ chainId: getNetworkId(selectedNetwork) });
          }

          setOfframpStarted(true);

          trackEvent({
            event: 'transaction_confirmation',
            from_asset: getInputTokenDetailsOrDefault(selectedNetwork, inputTokenType).assetSymbol,
            to_asset: OUTPUT_TOKEN_CONFIG[outputTokenType].stellarAsset.code.string,
            from_amount: amountInUnits,
            to_amount: calculateTotalReceive(offrampAmount, OUTPUT_TOKEN_CONFIG[outputTokenType]),
          });

          const stellarEphemeralSecret = createStellarEphemeralSecret();
          const outputToken = OUTPUT_TOKEN_CONFIG[outputTokenType];
          const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl!);

          if (!address) {
            throw new Error('useSubmitOfframp: Address must be defined at this stage');
          }

          const { token: sep10Token, sep10Account } = await sep10(
            tomlValues,
            stellarEphemeralSecret,
            outputTokenType,
            address,
            checkAndWaitForSignature,
            forceRefreshAndWaitForSignature,
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
            setInitialResponseSEP24(firstSep24Response);
          };

          setUrlIntervalSEP24(window.setInterval(fetchAndUpdateSep24Url, 20000));

          try {
            await fetchAndUpdateSep24Url();
          } catch (error) {
            console.error('Error finalizing the initial state of the offramping process', error);
            setInitializeFailed();
            setOfframpStarted(false);
            cleanupSEP24();
          } finally {
            setOfframpInitiating(false);
          }
        } catch (error) {
          console.error('Error initializing the offramping process', (error as Error).message);
          // Display error message, differentiating between user rejection and other errors
          if ((error as Error).message.includes('User rejected')) {
            showToast(ToastMessage.ERROR, 'You must sign the login request to be able to sell Argentine Peso');
          } else {
            setInitializeFailed();
          }
          setOfframpStarted(false);
          setOfframpInitiating(false);
        }
      })();
    },
    [
      offrampStarted,
      offrampState,
      setOfframpInitiating,
      switchChain,
      setOfframpStarted,
      trackEvent,
      selectedNetwork,
      address,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setExecutionInput,
      setAnchorSessionParams,
      setInitialResponseSEP24,
      setUrlIntervalSEP24,
      cleanupSEP24,
      switchChainAsync,
    ],
  );
};
