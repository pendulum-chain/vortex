import type {
  AlfredpayKycFormData,
  KybBusinessFiles,
  KybFormData,
  KybPersonFiles,
  KybQuestionnaireData,
  MxnKycFiles
} from "@vortexfi/kyc";
import { useCallback } from "react";
import { useAlfredpayKycActor, useAlfredpayKycSelector, useRampStateSelector } from "../../contexts/rampState";
import { DoneScreen } from "../DoneScreen";
import { ArKycFormScreen } from "./ArKycFormScreen";
import { ColKycFormScreen } from "./ColKycFormScreen";
import { CustomerDefinitionScreen } from "./CustomerDefinitionScreen";
import { FailureKycScreen } from "./FailureKycScreen";
import { FailureScreen } from "./FailureScreen";
import { FillingScreen } from "./FillingScreen";
import { KybBusinessDocsScreen } from "./KybBusinessDocsScreen";
import { KybFormScreen } from "./KybFormScreen";
import { KybPersonDocsScreen } from "./KybPersonDocsScreen";
import { KybQuestionnaireScreen } from "./KybQuestionnaireScreen";
import { LinkReadyScreen } from "./LinkReadyScreen";
import { LoadingScreen } from "./LoadingScreen";
import { MxnDocumentUploadScreen } from "./MxnDocumentUploadScreen";
import { MxnKycFormScreen } from "./MxnKycFormScreen";
import { OpeningLinkScreen } from "./OpeningLinkScreen";
import { PollingScreen } from "./PollingScreen";

export const AlfredpayKycFlow = () => {
  const actor = useAlfredpayKycActor();
  const state = useAlfredpayKycSelector();
  const userEmail = useRampStateSelector(snapshot => snapshot.context.userEmail);
  // Set only once an invite was redeemed — the invitation's recipient type is then authoritative.
  const inviteCustomerType = useRampStateSelector(snapshot => snapshot.context.kybLink?.customerType);

  const confirmSuccess = useCallback(() => actor?.send({ type: "CONFIRM_SUCCESS" }), [actor]);
  const openLink = useCallback(() => actor?.send({ type: "OPEN_LINK" }), [actor]);
  const completedFilling = useCallback(() => actor?.send({ type: "COMPLETED_FILLING" }), [actor]);
  const toggleBusiness = useCallback(() => actor?.send({ type: "TOGGLE_BUSINESS" }), [actor]);
  const userAccept = useCallback(() => actor?.send({ type: "USER_ACCEPT" }), [actor]);
  const userRetry = useCallback(() => actor?.send({ type: "USER_RETRY" }), [actor]);
  const userCancel = useCallback(() => actor?.send({ type: "USER_CANCEL" }), [actor]);
  const retryProcess = useCallback(() => actor?.send({ type: "RETRY_PROCESS" }), [actor]);
  const cancelProcess = useCallback(() => actor?.send({ type: "CANCEL_PROCESS" }), [actor]);
  const submitForm = useCallback((data: AlfredpayKycFormData) => actor?.send({ data, type: "SUBMIT_FORM" }), [actor]);
  const submitFiles = useCallback((files: MxnKycFiles) => actor?.send({ files, type: "SUBMIT_FILES" }), [actor]);
  const submitKybForm = useCallback((data: KybFormData) => actor?.send({ data, type: "SUBMIT_KYB_FORM" }), [actor]);
  const submitKybQuestionnaire = useCallback(
    (data: KybQuestionnaireData) => actor?.send({ data, type: "SUBMIT_KYB_QUESTIONNAIRE" }),
    [actor]
  );
  const submitKybBusinessFiles = useCallback(
    (files: KybBusinessFiles) => actor?.send({ files, type: "SUBMIT_KYB_BUSINESS_FILES" }),
    [actor]
  );
  const submitKybPersonFiles = useCallback(
    (files: KybPersonFiles) => actor?.send({ files, type: "SUBMIT_KYB_PERSON_FILES" }),
    [actor]
  );
  const goBack = useCallback(() => actor?.send({ type: "GO_BACK" }), [actor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;
  const kycOrKyb = context.business ? "KYB" : "KYC";
  const isMxn = context.country === "MX";
  const isCo = context.country === "CO";
  const isAr = context.country === "AR";

  if (
    stateValue === "CheckingStatus" ||
    stateValue === "CreatingCustomer" ||
    stateValue === "GettingKycLink" ||
    stateValue === "Retrying" ||
    stateValue === "SubmittingKycInfo" ||
    stateValue === "SubmittingFiles" ||
    stateValue === "SendingSubmission" ||
    stateValue === "SubmittingKybInfo" ||
    stateValue === "SubmittingKybBusinessFiles" ||
    stateValue === "FindingKybCustomerAndBusiness" ||
    stateValue === "SubmittingKybRelatedPersonBundle" ||
    stateValue === "SubmittingKybPersonFiles" ||
    stateValue === "SendingKybSubmission"
  ) {
    return <LoadingScreen />;
  }

  if (stateValue === "FillingKycForm" && isMxn) {
    return <MxnKycFormScreen onSubmit={submitForm} userEmail={userEmail} />;
  }

  if (stateValue === "FillingKycForm" && isCo) {
    return <ColKycFormScreen onSubmit={submitForm} />;
  }

  if (stateValue === "FillingKycForm" && isAr) {
    return <ArKycFormScreen onSubmit={submitForm} userEmail={userEmail} />;
  }

  if (stateValue === "UploadingDocuments" && (isMxn || isCo || isAr)) {
    const includeSelfie = isAr;
    const i18nNamespace = isAr ? "components.arDocumentUpload" : undefined;
    return (
      <MxnDocumentUploadScreen
        error={context.error?.message}
        i18nNamespace={i18nNamespace}
        includeSelfie={includeSelfie}
        onSubmit={submitFiles}
      />
    );
  }

  if (stateValue === "FillingKybForm") {
    return (
      <KybFormScreen country={context.country} defaults={context.kybFormData} onSubmit={submitKybForm} userEmail={userEmail} />
    );
  }

  if (stateValue === "FillingKybQuestionnaire") {
    return <KybQuestionnaireScreen defaults={context.kybQuestionnaireData} onBack={goBack} onSubmit={submitKybQuestionnaire} />;
  }

  if (stateValue === "UploadingKybBusinessDocs") {
    return (
      <KybBusinessDocsScreen
        isRegulatedBusiness={context.kybQuestionnaireData?.isRegulatedBusiness}
        onBack={goBack}
        onSubmit={submitKybBusinessFiles}
      />
    );
  }

  if (stateValue === "UploadingKybPersonDocs") {
    const totalPersons = context.kybRelatedPersonIds?.length ?? 1;
    const currentIndex = context.kybRelatedPersonIndex ?? 0;
    return (
      <KybPersonDocsScreen
        currentIndex={currentIndex}
        onBack={goBack}
        onSubmit={submitKybPersonFiles}
        totalPersons={totalPersons}
      />
    );
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

  if (stateValue === "CustomerDefinition") {
    return (
      <CustomerDefinitionScreen
        isBusiness={context.business ?? false}
        kycOrKyb={kycOrKyb}
        onAccept={userAccept}
        onToggleBusiness={inviteCustomerType ? undefined : toggleBusiness}
      />
    );
  }

  return null;
};
