import { FiatToken, getTokenDetailsSpacewalk } from "@packages/shared";
import Big from "big.js";
import { useCallback } from "react";
import { useTranslation } from "react-i18next";

import { RampDirection } from "../../components/RampToggle";
import { useNetwork } from "../../contexts/network";
import { useSiweContext } from "../../contexts/siwe";
import { useToastMessage } from "../../helpers/notifications";
import { sep10 } from "../../services/anchor/sep10";
import { sep24First } from "../../services/anchor/sep24/first";
import { MoneriumService } from "../../services/api/monerium.service";
import { handleMoneriumSiweAuth, initiateMoneriumAuth } from "../../services/monerium/moneriumAuth";
import { fetchTomlValues } from "../../services/stellar";
import { useMoneriumStore } from "../../stores/moneriumStore";
import { useRampDirection } from "../../stores/rampDirectionStore";
import { useRampActions } from "../../stores/rampStore";
import { useSep24Actions } from "../../stores/sep24Store";
import { RampExecutionInput } from "../../types/phases";
import { useMoneriumFlow } from "../monerium/useMoneriumFlow";
import { useVortexAccount } from "../useVortexAccount";

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
    setRampSigningPhase
  } = useRampActions();

  const {
    setAnchorSessionParams,
    setInitialResponse: setInitialResponseSEP24,
    setUrlInterval: setUrlIntervalSEP24,
    cleanup: cleanupSEP24
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
          // XSTATE migrate: where do we trigger this?? maybe an action?
          await setSelectedNetwork(selectedNetwork);

          if (!address) {
            throw new Error("Address must be defined at this stage");
          }

          if (!chainId) {
            throw new Error("ChainId must be defined at this stage");
          }

          // XSTATE migration: all these kyc logic must be moved to the respective child state machines.
          // ARS and EURC flows (offramp) should both be handled with the same logic.
          if (executionInput.fiatToken === FiatToken.EURC) {
            // Check if backend should route to Monerium or Stellar anchor
            const shouldUseMonerium = rampDirection === RampDirection.ONRAMP || (await shouldRouteToMonerium(executionInput));

            if (shouldUseMonerium) {
              setRampSummaryVisible(true);
              const userStatus = await MoneriumService.checkUserStatus(address);
              setMoneriumTriggered(true);
              setIsNewUser(userStatus.isNewUser);

              setRampSigningPhase("started");
              if (userStatus.isNewUser) {
                const authUrl = await initiateMoneriumAuth(address, getMessageSignature);
                window.location.href = authUrl;
                // Upon redirect back to the app with the code (if successful), the Monerium flow hook will handle the
                // exchange of the code for auth tokens.
              } else {
                // SIWE login for existing users
                try {
                  await handleMoneriumSiweAuth(address, getMessageSignature);
                } catch (error) {
                  console.error("Error with Monerium SIWE auth:", error);
                  showToast(ToastMessage.ERROR, "Failed to authenticate with Monerium");
                  setRampStarted(false);
                  resetRampState();
                  setRampInitiating(false);
                } finally {
                  setRampInitiating(false);
                }
              }
              setRampSigningPhase("signed");
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
                forceRefreshAndWaitForSignature
              );

              // We have to add the fee to the amount we are going to send to the anchor. It will be deducted from the amount we are going to receive.
              const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee.anchor);

              const anchorSessionParams = {
                offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
                token: sep10Token,
                tokenConfig: outputToken,
                tomlValues
              };

              setAnchorSessionParams(anchorSessionParams);

              const fetchAndUpdateSep24Url = async () => {
                const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, executionInput.fiatToken);
                const url = new URL(firstSep24Response.url);
                url.searchParams.append("callback", "postMessage");
                firstSep24Response.url = url.toString();
                setInitialResponseSEP24(firstSep24Response);
              };
              setRampSummaryVisible(true);
              setUrlIntervalSEP24(window.setInterval(fetchAndUpdateSep24Url, 20000));
              try {
                await fetchAndUpdateSep24Url();
              } catch (error) {
                console.error("Error finalizing the initial state of the offramping process", error);
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
              forceRefreshAndWaitForSignature
            );

            // We have to add the fee to the amount we are going to send to the anchor. It will be deducted from the amount we are going to receive.
            const offrampAmountBeforeFees = Big(executionInput.quote.outputAmount).plus(executionInput.quote.fee.anchor);

            const anchorSessionParams = {
              offrampAmount: offrampAmountBeforeFees.toFixed(2, 0),
              token: sep10Token,
              tokenConfig: outputToken,
              tomlValues
            };

            setAnchorSessionParams(anchorSessionParams);

            const fetchAndUpdateSep24Url = async () => {
              const firstSep24Response = await sep24First(anchorSessionParams, sep10Account, executionInput.fiatToken);
              const url = new URL(firstSep24Response.url);
              url.searchParams.append("callback", "postMessage");
              firstSep24Response.url = url.toString();
              setInitialResponseSEP24(firstSep24Response);
            };
            setRampSummaryVisible(true);
            setUrlIntervalSEP24(window.setInterval(fetchAndUpdateSep24Url, 20000));
            try {
              await fetchAndUpdateSep24Url();
            } catch (error) {
              console.error("Error finalizing the initial state of the offramping process", error);
              executionInput.setInitializeFailed();
              setRampStarted(false);
              resetRampState();
              cleanupSEP24();
            } finally {
              setRampInitiating(false);
            }
          }
        } catch (error) {
          console.error("Error initializing the offramping process", (error as Error).message);
          if ((error as Error).message.includes("User rejected")) {
            showToast(ToastMessage.ERROR, "You must sign the login request to be able to sell Argentine Peso");
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
      setRampSigningPhase,
      setMoneriumTriggered,
      resetRampState
    ]
  );
};

// Helper function to determine if EUR flow should use Monerium
async function shouldRouteToMonerium(executionInput: RampExecutionInput): Promise<boolean> {
  try {
    // BY default, we don't use Monerium for EUR offramps
    return false;
  } catch (error) {
    console.error("Error determining EUR anchor routing:", error);
    return false;
  }
}
