import { useCallback } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { useVortexAccount } from '../../hooks/useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';
import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  getOutputTokenDetailsSpacewalk,
  OutputTokenTypes,
} from '../../constants/tokenConfig';
import { createStellarEphemeralSecret, fetchTomlValues } from '../../services/stellar';
import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';
import { useOfframpActions } from '../../stores/offrampStore';
import { useSep24Actions } from '../../stores/sep24Store';
import { useToastMessage } from '../../hooks/useToastMessage';
import { OfframpExecutionInput } from '../../types/offramp';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { getSubaccount } from '../../services/signingService';

export const useSubmitOfframp = () => {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const { address } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();

  const {
    setOfframpStarted,
    setOfframpInitiating,
    setOfframpExecutionInput,
    setOfframpKycStarted,
    setInitializeFailedMessage,
    setOfframpSummaryVisible,
  } = useOfframpActions();

  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();
  const { apiComponents: pendulumNode } = usePendulumNode();

  const { chainId } = useVortexAccount();

  return useCallback(
    (executionInput: OfframpExecutionInput) => {
      if (!pendulumNode || !executionInput) {
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

          if (!chainId) {
            throw new Error('ChainId must be defined at this stage');
          }

          // @TODO: BRL-related logic should be in a separate function/hook
          if (executionInput.outputTokenType === OutputTokenTypes.BRL) {
            const { taxId, pixId } = executionInput;
            if (!taxId || !pixId) {
              console.log('no tax id or pix id defined');
              setOfframpStarted(false);
              setOfframpInitiating(false);
              return;
            }

            const { userExists, kycInvalid, subaccountData } = await getSubaccount(taxId);
            if (!userExists) {
              console.log('User does not exist');
              setOfframpKycStarted(true);
              return;
            } else if (kycInvalid) {
              console.log('KYC invalid');
              setInitializeFailedMessage(t('hooks.useSubmitOfframp.kycInvalid'));
              setOfframpStarted(false);
              setOfframpInitiating(false);
              cleanupSEP24();
              return;
            }

            const {
              wallets: { evm: brlaEvmAddress },
            } = subaccountData;
            // append EVM address to execution input
            const updatedBrlaOfframpExecution = { ...executionInput, brlaEvmAddress };
            setOfframpExecutionInput(updatedBrlaOfframpExecution);

            setOfframpSummaryVisible(true);
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
            setOfframpSummaryVisible(true);
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
      pendulumNode,
      setOfframpInitiating,
      setOfframpStarted,
      setSelectedNetwork,
      selectedNetwork,
      trackEvent,
      address,
      chainId,
      setOfframpExecutionInput,
      setOfframpSummaryVisible,
      setOfframpKycStarted,
      setInitializeFailedMessage,
      t,
      cleanupSEP24,
      checkAndWaitForSignature,
      forceRefreshAndWaitForSignature,
      setAnchorSessionParams,
      setUrlIntervalSEP24,
      setInitialResponseSEP24,
      showToast,
      ToastMessage.ERROR,
    ],
  );
};
