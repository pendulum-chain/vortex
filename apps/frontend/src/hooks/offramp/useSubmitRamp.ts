import { BrlaEndpoints, FiatToken, getTokenDetailsSpacewalk } from '@packages/shared';
import Big from 'big.js';
import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';

import { RampDirection } from '../../components/RampToggle';
import { useNetwork } from '../../contexts/network';
import { useSiweContext } from '../../contexts/siwe';
import { useToastMessage } from '../../helpers/notifications';
import { sep10 } from '../../services/anchor/sep10';
import { sep24First } from '../../services/anchor/sep24/first';
import { BrlaService } from '../../services/api';
import { MoneriumService } from '../../services/api/monerium.service';
import {
  exchangeMoneriumCode,
  handleMoneriumSiweAuth,
  initiateMoneriumAuth,
} from '../../services/monerium/moneriumAuth';
import { fetchTomlValues } from '../../services/stellar';
import { useMoneriumStore } from '../../stores/moneriumStore';
import { useRampDirection } from '../../stores/rampDirectionStore';
import { useRampActions } from '../../stores/rampStore';
import { useSep24Actions } from '../../stores/sep24Store';
import { RampExecutionInput } from '../../types/phases';
import { useMoneriumFlow } from '../monerium/useMoneriumFlow';
import { isValidCnpj, isValidCpf } from '../ramp/schema';
import { useVortexAccount } from '../useVortexAccount';

export const useSubmitRamp = () => {
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  const { selectedNetwork, setSelectedNetwork } = useNetwork();
  const { address, getMessageSignature } = useVortexAccount();
  const { checkAndWaitForSignature, forceRefreshAndWaitForSignature } = useSiweContext();
  const rampDirection = useRampDirection();

  const {
    setRampStarted,
    setRampInitiating,
    setRampExecutionInput,
    setRampKycStarted,
    setInitializeFailedMessage,
    setRampSummaryVisible,
    setRampKycLevel2Started,
    resetRampState,
  } = useRampActions();

  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24,
  } = useSep24Actions();
  const { chainId } = useVortexAccount();

  const { setTriggered: setMoneriumTriggered, setIsNewUser } = useMoneriumStore();
  useMoneriumFlow();

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

              const remainingLimitResponse = await BrlaService.getUserRemainingLimit(taxId);

              const remainingLimitInUnits =
                rampDirection === RampDirection.OFFRAMP
                  ? remainingLimitResponse.remainingLimitOfframp
                  : remainingLimitResponse.remainingLimitOnramp;

              const amountNum = Number(
                rampDirection === RampDirection.OFFRAMP
                  ? executionInput.quote.outputAmount
                  : executionInput.quote.inputAmount,
              );
              const remainingLimitNum = Number(remainingLimitInUnits);
              if (amountNum > remainingLimitNum) {
                // Check for a kyc level 1 here is implicit, due to checks in `useRampAmountWithinAllowedLimits` and
                // handling of level 0 users.
                setRampKycLevel2Started(true);
                return;
              }

              // append EVM address to execution input
              const updatedBrlaRampExecution = {
                ...executionInput,
                brlaEvmAddress,
              };
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
          } else if (executionInput.fiatToken === FiatToken.EURC) {
            // Check if backend should route to Monerium or Stellar anchor
            const shouldUseMonerium =
              rampDirection === RampDirection.ONRAMP || (await shouldRouteToMonerium(executionInput));

            if (shouldUseMonerium) {
              const userStatus = await MoneriumService.checkUserStatus(address);
              setMoneriumTriggered(true);
              setIsNewUser(userStatus.isNewUser);

              if (userStatus.isNewUser) {
                const authUrl = await initiateMoneriumAuth(address, getMessageSignature);
                window.location.href = authUrl;
                // Upon redirect back to the app with the code (if successful), the Monerium flow hook will handle the
                // exchange of the code for auth tokens.
              } else {
                // SIWE login for existing users
                try {
                  const code = await handleMoneriumSiweAuth(address, getMessageSignature);
                  //await exchangeMoneriumCode(code);
                } catch (error) {
                  console.error('Error with Monerium SIWE auth:', error);
                  showToast(ToastMessage.ERROR, 'Failed to authenticate with Monerium');
                  setRampStarted(false);
                  resetRampState();
                  setRampInitiating(false);
                } finally {
                  setRampInitiating(false);
                }
              }

              setRampSummaryVisible(true);
            } else {
              // Regular Stellar anchor flow for EUR
              const stellarEphemeralSecret = executionInput.ephemerals.stellarEphemeral.secret;
              const outputToken = getTokenDetailsSpacewalk(executionInput.fiatToken);
              const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl);

              const { token: sep10Token, sep10Account } = await sep10(
                tomlValues,
                stellarEphemeralSecret,
                executionInput.fiatToken,
                address,
                checkAndWaitForSignature,
                forceRefreshAndWaitForSignature,
              );

              // We have to add the fee to the amount we are going to send to the anchor. It will be deducted from the amount we are going to receive.
              const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(
                executionInput.quote.fee.anchor,
              );

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
                  executionInput.fiatToken,
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
                resetRampState();
                cleanupSEP24();
              } finally {
                setRampInitiating(false);
              }
            }
          } else {
            // ARS flow (unchanged)
            const stellarEphemeralSecret = executionInput.ephemerals.stellarEphemeral.secret;
            const outputToken = getTokenDetailsSpacewalk(executionInput.fiatToken);
            const tomlValues = await fetchTomlValues(outputToken.tomlFileUrl);

            const { token: sep10Token, sep10Account } = await sep10(
              tomlValues,
              stellarEphemeralSecret,
              executionInput.fiatToken,
              address,
              checkAndWaitForSignature,
              forceRefreshAndWaitForSignature,
            );

            // We have to add the fee to the amount we are going to send to the anchor. It will be deducted from the amount we are going to receive.
            const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(
              executionInput.quote.fee.anchor,
            );

            const anchorSessionParams = {
              token: sep10Token,
              tomlValues,
              tokenConfig: outputToken,
              offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
            };

            setAnchorSessionParams(anchorSessionParams);

            const fetchAndUpdateSep24Url = async () => {
              const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, executionInput.fiatToken);
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
              resetRampState();
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
      rampDirection,
      setRampKycLevel2Started,
      ToastMessage.ERROR,
      setIsNewUser,
      getMessageSignature,
    ],
  );
};

// Helper function to determine if EUR flow should use Monerium
async function shouldRouteToMonerium(executionInput: RampExecutionInput): Promise<boolean> {
  try {
    // TODO: Replace with actual backend routing logic
    if (executionInput.quote.rampType === 'off') {
      return true; // Offramp should not use Monerium
    }
    return executionInput.quote.rampType === 'on';
  } catch (error) {
    console.error('Error determining EUR anchor routing:', error);
    return false;
  }
}
