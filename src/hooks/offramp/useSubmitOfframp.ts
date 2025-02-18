import { useCallback } from 'react';

import { useVortexAccount } from '../useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';

import {
  getInputTokenDetailsOrDefault,
  getBaseOutputTokenDetails,
  isStellarOutputToken,
  getOutputTokenDetailsSpacewalk,
} from '../../constants/tokenConfig';
import { createStellarEphemeralSecret, fetchTomlValues } from '../../services/stellar';

import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';

import { useOfframpActions, useOfframpStarted, useOfframpState } from '../../stores/offrampStore';
import { useSep24Actions } from '../../stores/sep24Store';

import { showToast, ToastMessage } from '../../helpers/notifications';
import Big from 'big.js';
import { OfframpExecutionInput } from '../../types/offramp';

export const useSubmitOfframp = () => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const { address } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();
  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const { setOfframpStarted, setOfframpInitiating, setOfframpExecutionInput } = useOfframpActions();
  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();

  return useCallback(
    (executionInput: OfframpExecutionInput) => {
      const { inputTokenType, inputAmountUnits, outputTokenType, outputAmountUnits, setInitializeFailed } =
        executionInput;

      // For now, we do nothing for BRLA. Later, we should route the flow from here.
      if (!isStellarOutputToken(outputTokenType)) {
        setOfframpInitiating(false);
        return;
      }
      if (offrampStarted || offrampState !== undefined) {
        setOfframpInitiating(false);
        return;
      }

      (async () => {
        setOfframpStarted(true);

        try {
          await setSelectedNetwork(selectedNetwork);

          setOfframpStarted(true);

          trackEvent({
            event: 'transaction_confirmation',
            from_asset: getInputTokenDetailsOrDefault(selectedNetwork, inputTokenType).assetSymbol,
            to_asset: getBaseOutputTokenDetails(outputTokenType).fiat.symbol,
            from_amount: inputAmountUnits,
            to_amount: outputAmountUnits.afterFees,
          });

          const stellarEphemeralSecret = createStellarEphemeralSecret();
          const outputToken = getOutputTokenDetailsSpacewalk(outputTokenType);
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
            offrampAmount: Big(outputAmountUnits.beforeFees).toFixed(2, 0),
          };

          setOfframpExecutionInput({
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
      setOfframpStarted,
      trackEvent,
      selectedNetwork,
      address,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setOfframpExecutionInput,
      setAnchorSessionParams,
      setInitialResponseSEP24,
      setUrlIntervalSEP24,
      cleanupSEP24,
      setSelectedNetwork,
    ],
  );
};
