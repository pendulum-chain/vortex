import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMykoboKycActor, useMykoboKycSelector, useRampActor } from "../../contexts/rampState";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";
import { DoneScreen } from "../DoneScreen";
import { Spinner } from "../Spinner";
import { MykoboKycForm } from "./MykoboKycForm";

const LoadingPanel = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center gap-2 p-6">
    <p className="mb-12 text-center text-body">{message}</p>
    <Spinner size="lg" theme="dark" />
  </div>
);

interface FailurePanelProps {
  message: string;
  detail?: string;
  onStartOver: () => void;
  startOverLabel: string;
}

const FailurePanel = ({ message, detail, onStartOver, startOverLabel }: FailurePanelProps) => (
  <div className="flex flex-col items-center gap-4 p-6">
    <p className="text-center text-body text-red-800">{message}</p>
    {detail && <p className="text-sm">{detail}</p>}
    <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onStartOver}>
      {startOverLabel}
    </button>
  </div>
);

export const MykoboKycFlow = () => {
  const { t } = useTranslation();
  const actor = useMykoboKycActor();
  const rampActor = useRampActor();
  const state = useMykoboKycSelector();

  const submitForm = useCallback(
    (formData: MykoboKycFormData, files: MykoboKycFiles) => actor?.send({ files, formData, type: "SubmitKycForm" }),
    [actor]
  );
  const confirmSuccess = useCallback(() => actor?.send({ type: "CONFIRM_SUCCESS" }), [actor]);
  const startOver = useCallback(() => rampActor.send({ type: "RESET_RAMP" }), [rampActor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;

  if (stateValue === "CheckingProfile") {
    return <LoadingPanel message={t("components.mykoboKycFlow.checkingProfile")} />;
  }

  if (stateValue === "Submitting") {
    return <LoadingPanel message={t("components.mykoboKycFlow.submitting")} />;
  }

  if (stateValue === "Verifying") {
    return <LoadingPanel message={t("components.mykoboKycFlow.verifying")} />;
  }

  if (stateValue === "FormFilling") {
    return <MykoboKycForm onSubmit={submitForm} />;
  }

  if (stateValue === "VerificationDone" || stateValue === "Done") {
    return <DoneScreen kycOrKyb="KYC" onContinue={stateValue === "VerificationDone" ? confirmSuccess : undefined} />;
  }

  if (stateValue === "Rejected") {
    return (
      <FailurePanel
        detail={context.error?.message}
        message={t("components.mykoboKycFlow.rejected")}
        onStartOver={startOver}
        startOverLabel={t("components.mykoboKycFlow.startOver")}
      />
    );
  }

  if (stateValue === "Failure") {
    return (
      <FailurePanel
        detail={context.error?.message}
        message={t("components.mykoboKycFlow.failure")}
        onStartOver={startOver}
        startOverLabel={t("components.mykoboKycFlow.startOver")}
      />
    );
  }

  return null;
};
