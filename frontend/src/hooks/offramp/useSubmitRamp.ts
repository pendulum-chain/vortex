import { useCallback } from 'react';
import Big from 'big.js';
import { useTranslation } from 'react-i18next';

import { useVortexAccount } from '../useVortexAccount';
import { useNetwork } from '../../contexts/network';
import { useEventsContext } from '../../contexts/events';
import { useSiweContext } from '../../contexts/siwe';
import {
  BrlaEndpoints,
  FiatToken,
  getAnyFiatTokenDetails,
  getOnChainTokenDetailsOrDefault,
  getTokenDetailsSpacewalk,
} from 'shared';
import { fetchTomlValues } from '../../services/stellar';
import { sep24First } from '../../services/anchor/sep24/first';
import { sep10 } from '../../services/anchor/sep10';
import { useRampActions } from '../../stores/rampStore';
import { useSep24Actions } from '../../stores/sep24Store';
import { SIGNING_SERVICE_URL } from '../../constants/constants';
import { RampExecutionInput } from '../../types/phases';
import { useToastMessage } from '../../helpers/notifications';
import { isValidCnpj, isValidCpf } from '../ramp/schema';
import { BrlaService } from '../../services/api';

export const useSubmitRamp = () => {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
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
  const { chainId } = useVortexAccount();

  return useCallback(
    (executionInput: RampExecutionInput) => {
      if (!executionInput) {
        setRampInitiating(false);
        return;
      }

      (async () => {
        setRampInitiating(true);
        try {
          await setSelectedNetwork(selectedNetwork);

          trackEvent({
            event: 'transaction_confirmation',
            from_asset: getOnChainTokenDetailsOrDefault(selectedNetwork, executionInput.onChainToken).assetSymbol,
            to_asset: getAnyFiatTokenDetails(executionInput.fiatToken).fiat.symbol,
            from_amount: executionInput.quote.inputAmount,
            to_amount: executionInput.quote.outputAmount,
          });

          if (!address) {
            throw new Error('Address must be defined at this stage');
          }

          if (!chainId) {
            throw new Error('ChainId must be defined at this stage');
          }

          // @TODO: BRL-related logic should be in a separate function/hook
          if (executionInput.fiatToken === FiatToken.BRL) {
            const { taxId } = executionInput;
            if (!taxId) {
              setRampStarted(false);
              setRampInitiating(false);
              return;
            }

            try {
              const { evmAddress: brlaEvmAddress } = await BrlaService.getUser(taxId);

              // append EVM address to execution input
              const updatedBrlaRampExecution = { ...executionInput, brlaEvmAddress };
              setRampExecutionInput(updatedBrlaRampExecution);

              setRampSummaryVisible(true);
            } catch (err) {
              const errorResponse = err as BrlaEndpoints.BrlaErrorResponse;

              // Response can also fail due to invalid KYC. Nevertheless, this should never be the case, as when we create the user we wait for the KYC
              // to be valid, or retry.
              if (isValidCpf(taxId) || isValidCnpj(taxId)) {
                console.log("User doesn't exist yet.");
                setRampKycStarted(true);
              } else if (errorResponse.error.includes('KYC invalid')) {
                setInitializeFailedMessage(t('hooks.useSubmitOfframp.kycInvalid'));
                setRampStarted(false);
                setRampInitiating(false);
                cleanupSEP24();
                return;
              }
              throw new Error('Error while fetching BRLA user');
            }
          } else {
            const stellarEphemeralSecret = executionInput.ephemerals.stellarEphemeral.secret;
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

            // We have to add the fee to the amount we are going to send to the anchor. It will be deducted from the amount we are going to receive.
            const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee);

            const anchorSessionParams = {
              token: sep10Token,
              tomlValues,
              tokenConfig: outputToken,
              offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
            };

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
      setRampInitiating,
      setSelectedNetwork,
      selectedNetwork,
      trackEvent,
      address,
      chainId,
      setRampExecutionInput,
      setRampSummaryVisible,
      setRampStarted,
      setRampKycStarted,
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
