import { useCallback } from "react";
import { useAlfredpayKycActor, useAlfredpayKycSelector } from "../../contexts/rampState";
import { CustomerDefinitionScreen } from "./CustomerDefinitionScreen";
import { DoneScreen } from "./DoneScreen";
import { FailureKycScreen } from "./FailureKycScreen";
import { FailureScreen } from "./FailureScreen";
import { FillingScreen } from "./FillingScreen";
import { LinkReadyScreen } from "./LinkReadyScreen";
import { LoadingScreen } from "./LoadingScreen";
import { OpeningLinkScreen } from "./OpeningLinkScreen";
import { PollingScreen } from "./PollingScreen";

export const AlfredpayKycFlow = () => {
  const actor = useAlfredpayKycActor();
  const state = useAlfredpayKycSelector();

  const confirmSuccess = useCallback(() => actor?.send({ type: "CONFIRM_SUCCESS" }), [actor]);
  const openLink = useCallback(() => actor?.send({ type: "OPEN_LINK" }), [actor]);
  const completedFilling = useCallback(() => actor?.send({ type: "COMPLETED_FILLING" }), [actor]);
  const toggleBusiness = useCallback(() => actor?.send({ type: "TOGGLE_BUSINESS" }), [actor]);
  const userAccept = useCallback(() => actor?.send({ type: "USER_ACCEPT" }), [actor]);
  const userRetry = useCallback(() => actor?.send({ type: "USER_RETRY" }), [actor]);
  const userCancel = useCallback(() => actor?.send({ type: "USER_CANCEL" }), [actor]);
  const retryProcess = useCallback(() => actor?.send({ type: "RETRY_PROCESS" }), [actor]);
  const cancelProcess = useCallback(() => actor?.send({ type: "CANCEL_PROCESS" }), [actor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;
  const kycOrKyb = context.business ? "KYB" : "KYC";

  if (
    stateValue === "CheckingStatus" ||
    stateValue === "CreatingCustomer" ||
    stateValue === "GettingKycLink" ||
    stateValue === "Retrying"
  ) {
    return <LoadingScreen />;
  }

  if (stateValue === "PollingStatus") {
    return <PollingScreen kycOrKyb={kycOrKyb} />;
  }

  if (stateValue === "LinkReady") {
    return <LinkReadyScreen kycOrKyb={kycOrKyb} onOpenLink={openLink} />;
  }

  if (stateValue === "OpeningLink") {
    return <OpeningLinkScreen />;
  }

  if (stateValue === "FillingKyc" || stateValue === "FinishingFilling") {
    return (
      <FillingScreen
        isSubmitting={stateValue === "FinishingFilling"}
        kycOrKyb={kycOrKyb}
        onCompletedFilling={completedFilling}
        onOpenLink={openLink}
      />
    );
  }

  if (stateValue === "VerificationDone") {
    return <DoneScreen kycOrKyb={kycOrKyb} onContinue={confirmSuccess} />;
  }

  if (stateValue === "Done") {
    return <DoneScreen kycOrKyb={kycOrKyb} />;
  }

  if (stateValue === "FailureKyc") {
    return (
      <FailureKycScreen errorMessage={context.error?.message} kycOrKyb={kycOrKyb} onCancel={userCancel} onRetry={userRetry} />
    );
  }

  if (stateValue === "Failure") {
    return <FailureScreen errorMessage={context.error?.message} onCancel={cancelProcess} onRetry={retryProcess} />;
  }

  if (stateValue === "CostumerDefinition") {
    return (
      <CustomerDefinitionScreen
        isBusiness={context.business ?? false}
        kycOrKyb={kycOrKyb}
        onAccept={userAccept}
        onToggleBusiness={toggleBusiness}
      />
    );
  }

  return null;
};
