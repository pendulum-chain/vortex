import { useCallback } from 'react';
import Big from 'big.js';

import { useVortexAccount } from '../../hooks/useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';
import {
  getOnChainTokenDetailsOrDefault,
  getAnyFiatTokenDetails,
  getTokenDetailsSpacewalk,
  FiatToken,
} from '../../constants/tokenConfig';
import { createStellarEphemeralSecret, fetchTomlValues } from '../../services/stellar';
import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';
import { useRampActions } from '../../stores/offrampStore';
import { useSep24Actions } from '../../stores/sep24Store';
import { showToast, ToastMessage } from '../../helpers/notifications';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { RampExecutionInput } from '../../types/phases';

export const useSubmitOfframp = () => {
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const { address } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();

  const {
    setRampStarted,
    setRampInitiating,
    setRampExecutionInput,
    setRampKycStarted,
    setInitializeFailedMessage,
    setRampSummaryVisible,
  } = useRampActions();

  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();
  const { apiComponents: pendulumNode } = usePendulumNode();

  const { chainId } = useVortexAccount();

  return useCallback(
    (executionInput: RampExecutionInput) => {
      if (!pendulumNode || !executionInput) {
        setRampInitiating(false);
        return;
      }

      (async () => {
        setRampStarted(true);
        try {
          await setSelectedNetwork(selectedNetwork);

          trackEvent({
            event: 'transaction_confirmation',
            from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken).assetSymbol,
            to_asset: getAnyFiatTokenDetails(executionInput.fiatToken).fiat.symbol,
            from_amount: executionInput.inputAmountUnits,
            to_amount: executionInput.outputAmountUnits.afterFees,
          });

          if (!address) {
            throw new Error('Address must be defined at this stage');
          }

          if (!chainId) {
            throw new Error('ChainId must be defined at this stage');
          }

          // @TODO: BRL-related logic should be in a separate function/hook
          if (executionInput.fiatToken === FiatToken.BRL) {
            const { taxId, pixId } = executionInput;
            if (!taxId || !pixId) {
              console.log('no tax id or pix id defined');
              setRampStarted(false);
              setRampInitiating(false);
              return;
            }

            const response = await fetch(`${SIGNING_SERVICE_URL}/v1/brla/getUser?taxId=${taxId}`);
            if (!response.ok) {
              // Response can also fail due to invalid KYC. Nevertheless, this should never be the case, as when we create the user we wait for the KYC
              // to be valid, or retry.
              if (response.status === 404) {
                console.log("User doesn't exist yet.");
                setRampKycStarted(true);
                return;
              }
              if ((await response.text()).includes('KYC invalid')) {
                setInitializeFailedMessage('Your KYC level is invalid. Please contact support.');
                setRampStarted(false);
                setRampInitiating(false);
                cleanupSEP24();
                return;
              }
              throw new Error('Error while fetching BRLA user');
            }
            const { evmAddress: brlaEvmAddress } = await response.json();
            // append EVM address to execution input
            const updatedBrlaOfframpExecution = { ...executionInput, brlaEvmAddress };
            setRampExecutionInput(updatedBrlaOfframpExecution);

            setRampSummaryVisible(true);
          } else {
            const stellarEphemeralSecret = createStellarEphemeralSecret();
            const outputToken = getTokenDetailsSpacewalk(executionInput.fiatToken);
            const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl);

            const { token: sep10Token, sep10Account } = await sep10(
              tomlValues,
              stellarEphemeralSecret,
              executionInput.fiatToken, // FIXME is this correct?,
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

            setRampExecutionInput({ ...executionInput, stellarEphemeralSecret });
            setAnchorSessionParams(anchorSessionParams);

            const fetchAndUpdateSep24Url = async () => {
              const firstSep24Response = await sep24First(
                anchorSessionParams,
                sep10Account,
                executionInput.fiatToken, // FIXME: is this correct?
              );
              const url = new URL(firstSep24Response.url);
              url.searchParams.append('callback', 'postMessage');
              firstSep24Response.url = url.toString();
              setInitialResponseSEP24(firstSep24Response);
            };
            setRampSummaryVisible(true);
            setUrlIntervalSEP24(window.setInterval(fetchAndUpdateSep24Url, 20000));
            try {
              await fetchAndUpdateSep24Url();
            } catch (error) {
              console.error('Error finalizing the initial state of the offramping process', error);
              executionInput.setInitializeFailed();
              setRampStarted(false);
              cleanupSEP24();
            } finally {
              setRampInitiating(false);
            }
          }
        } catch (error) {
          console.error('Error initializing the offramping process', (error as Error).message);
          if ((error as Error).message.includes('User rejected')) {
            showToast(ToastMessage.ERROR, 'You must sign the login request to be able to sell Argentine Peso');
          } else {
            executionInput.setInitializeFailed();
          }
          setRampStarted(false);
          setRampInitiating(false);
        }
      })();
    },
    [
      pendulumNode,
      setRampInitiating,
      setRampStarted,
      setSelectedNetwork,
      selectedNetwork,
      trackEvent,
      address,
      setRampExecutionInput,
      setRampKycStarted,
      chainId,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setAnchorSessionParams,
      setUrlIntervalSEP24,
      setInitialResponseSEP24,
      cleanupSEP24,
      setInitializeFailedMessage,
      setRampSummaryVisible,
    ],
  );
};
