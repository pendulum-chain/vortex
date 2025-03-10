import { useCallback } from 'react';

import { useVortexAccount } from '../../hooks/useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';
import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  getOutputTokenDetailsSpacewalk,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { createStellarEphemeralSecret, fetchTomlValues } from '../../services/stellar';
import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';
import { useOfframpActions, useOfframpStarted, useOfframpState } from '../../stores/offrampStore';
import { useSep24Actions } from '../../stores/sep24Store';
import { showToast, ToastMessage } from '../../helpers/notifications';
import Big from 'big.js';
import { OfframpExecutionInput } from '../../types/offramp';
import { constructBrlaInitialState } from '../../services/offrampingFlow';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { useChainId } from 'wagmi';

export const useSubmitOfframp = () => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const { address } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();
  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const { setOfframpStarted, setOfframpInitiating, setOfframpExecutionInput, updateOfframpHookStateFromState } =
    useOfframpActions();
  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();
  const { apiComponents: pendulumNode } = usePendulumNode();

  const selectedNetworkId = useChainId();

  return useCallback(
    (executionInput: OfframpExecutionInput) => {
      if (offrampStarted || offrampState !== undefined || !pendulumNode) {
        setOfframpInitiating(false);
        return;
      }

      (async () => {
        setOfframpStarted(true);
        try {
          await setSelectedNetwork(selectedNetwork);

          trackEvent({
            event: 'transaction_confirmation',
            from_asset: getInputTokenDetailsOrDefault(selectedNetwork, executionInput.inputTokenType).assetSymbol,
            to_asset: getOutputTokenDetails(executionInput.outputTokenType).fiat.symbol,
            from_amount: executionInput.inputAmountUnits,
            to_amount: executionInput.outputAmountUnits.afterFees,
          });

          if (!address) {
            throw new Error('Address must be defined at this stage');
          }

          if (executionInput.outputTokenType === OutputTokenType.BRL) {
            const { taxId, pixId } = executionInput;
            if (!taxId || !pixId) {
              setOfframpStarted(false);
              setOfframpInitiating(false);
              return;
            }

            const response = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getUser?taxId=${taxId}`);
            if (!response.ok) {
              // Response can also fail due to invalid KYC. Nevertheless, this should never be the case, as when we create the user we wait for the KYC
              // to be valid, or retry.
              if (response.status === 404) {
                // TODO: Redirect to subaccount creation/KYC flow.
                setOfframpStarted(false);
                setOfframpInitiating(false);
                return;
              }
              throw new Error('Error while fetching funding account signature');
            }
            const { evmAddress: brlaEvmAddress } = await response.json();
            const brlaOfframpExecution = { ...executionInput, brlaEvmAddress };
            setOfframpExecutionInput(brlaOfframpExecution);

            const initialState = await constructBrlaInitialState({
              inputTokenType: executionInput.inputTokenType,
              outputTokenType: executionInput.outputTokenType,
              amountIn: executionInput.inputAmountUnits,
              amountOut: Big(executionInput.outputAmountUnits.beforeFees),
              network: selectedNetwork,
              networkId: selectedNetworkId,
              pendulumNode,
              offramperAddress: address,
              brlaEvmAddress,
              pixDestination: pixId,
              taxId,
            });
            updateOfframpHookStateFromState(initialState);
          } else {
            const stellarEphemeralSecret = createStellarEphemeralSecret();
            const outputToken = getOutputTokenDetailsSpacewalk(executionInput.outputTokenType);
            const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl);

            const { token: sep10Token, sep10Account } = await sep10(
              tomlValues,
              stellarEphemeralSecret,
              executionInput.outputTokenType,
              address,
              checkAndWaitForSignature,
              forceRefreshAndWaitForSignature,
            );

            const anchorSessionParams = {
              token: sep10Token,
              tomlValues,
              tokenConfig: outputToken,
              offrampAmount: Big(executionInput.outputAmountUnits.beforeFees).toFixed(2, 0),
            };

            setOfframpExecutionInput({ ...executionInput, stellarEphemeralSecret });
            setAnchorSessionParams(anchorSessionParams);

            const fetchAndUpdateSep24Url = async () => {
              const firstSep24Response = await sep24First(
                anchorSessionParams,
                sep10Account,
                executionInput.outputTokenType,
              );
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
              executionInput.setInitializeFailed();
              setOfframpStarted(false);
              cleanupSEP24();
            } finally {
              setOfframpInitiating(false);
            }
          }
        } catch (error) {
          console.error('Error initializing the offramping process', (error as Error).message);
          if ((error as Error).message.includes('User rejected')) {
            showToast(ToastMessage.ERROR, 'You must sign the login request to be able to sell Argentine Peso');
          } else {
            executionInput.setInitializeFailed();
          }
          setOfframpStarted(false);
          setOfframpInitiating(false);
        }
      })();
    },
    [
      offrampStarted,
      offrampState,
      pendulumNode,
      setOfframpInitiating,
      setOfframpStarted,
      setSelectedNetwork,
      selectedNetwork,
      trackEvent,
      address,
      setOfframpExecutionInput,
      selectedNetworkId,
      updateOfframpHookStateFromState,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setAnchorSessionParams,
      setUrlIntervalSEP24,
      setInitialResponseSEP24,
      cleanupSEP24,
    ],
  );
};
