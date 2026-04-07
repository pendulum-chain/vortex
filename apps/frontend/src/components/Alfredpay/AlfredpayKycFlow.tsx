import { useCallback } from "react";
import { useAlfredpayKycActor, useAlfredpayKycSelector } from "../../contexts/rampState";
import { ColKycFormScreen } from "./ColKycFormScreen";
import { CustomerDefinitionScreen } from "./CustomerDefinitionScreen";
import { DoneScreen } from "./DoneScreen";
import { FailureKycScreen } from "./FailureKycScreen";
import { FailureScreen } from "./FailureScreen";
import { FillingScreen } from "./FillingScreen";
import { LinkReadyScreen } from "./LinkReadyScreen";
import { LoadingScreen } from "./LoadingScreen";
import { MxnDocumentUploadScreen } from "./MxnDocumentUploadScreen";
import { MxnKycFormScreen } from "./MxnKycFormScreen";
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
  const submitForm = useCallback(
    (data: import("../../machines/alfredpayKyc.machine").MxnKycFormData) => actor?.send({ data, type: "SUBMIT_FORM" }),
    [actor]
  );
  const submitFiles = useCallback(
    (files: import("../../machines/alfredpayKyc.machine").MxnKycFiles) => actor?.send({ files, type: "SUBMIT_FILES" }),
    [actor]
  );

  if (!actor || !state) return null;

  const { stateValue, context } = state;
  const kycOrKyb = context.business ? "KYB" : "KYC";
  const isMxn = context.country === "MX";
  const isCo = context.country === "CO";

  if (
    stateValue === "CheckingStatus" ||
    stateValue === "CreatingCustomer" ||
    stateValue === "GettingKycLink" ||
    stateValue === "Retrying" ||
    stateValue === "SubmittingKycInfo" ||
    stateValue === "SubmittingFiles" ||
    stateValue === "SendingSubmission"
  ) {
    return <LoadingScreen />;
  }

  if (stateValue === "FillingKycForm" && isMxn) {
    return <MxnKycFormScreen onSubmit={submitForm} />;
  }

  if (stateValue === "FillingKycForm" && isCo) {
    return <ColKycFormScreen onSubmit={submitForm} />;
  }

  if (stateValue === "UploadingDocuments" && (isMxn || isCo)) {
    return <MxnDocumentUploadScreen onSubmit={submitFiles} />;
  }

  if (stateValue === "PollingStatus") {
    return <PollingScreen kycOrKyb={kycOrKyb} />;
  }

  // USD-only screens
  if (stateValue === "LinkReady" && !isMxn) {
    return <LinkReadyScreen kycOrKyb={kycOrKyb} onOpenLink={openLink} />;
  }

  if (stateValue === "OpeningLink" && !isMxn) {
    return <OpeningLinkScreen />;
  }

  if ((stateValue === "FillingKyc" || stateValue === "FinishingFilling") && !isMxn) {
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

  if (stateValue === "CustomerDefinition" && !isMxn && !isCo) {
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
