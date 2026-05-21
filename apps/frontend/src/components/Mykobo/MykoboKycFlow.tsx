import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMykoboKycActor, useMykoboKycSelector } from "../../contexts/rampState";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";
import { Spinner } from "../Spinner";
import { MykoboKycForm } from "./MykoboKycForm";

const LoadingPanel = ({ message }: { message: string }) => (
  <div className="flex flex-col items-center gap-2 p-6">
    <p className="mb-12 text-center text-body">{message}</p>
    <Spinner size="lg" theme="dark" />
  </div>
);

const ErrorPanel = ({ message, detail }: { message: string; detail?: string }) => (
  <div className="flex flex-col items-center gap-2 p-6">
    <p className="text-center text-body text-red-800">{message}</p>
    {detail && <p className="text-sm">{detail}</p>}
  </div>
);

export const MykoboKycFlow = () => {
  const { t } = useTranslation();
  const actor = useMykoboKycActor();
  const state = useMykoboKycSelector();

  const submitForm = useCallback(
    (formData: MykoboKycFormData, files: MykoboKycFiles) => actor?.send({ files, formData, type: "SubmitKycForm" }),
    [actor]
  );

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

  if (stateValue === "Done") {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body">{t("components.mykoboKycFlow.done")}</p>
      </div>
    );
  }

  if (stateValue === "Rejected") {
    return <ErrorPanel detail={context.error?.message} message={t("components.mykoboKycFlow.rejected")} />;
  }

  if (stateValue === "Failure") {
    return <ErrorPanel detail={context.error?.message} message={t("components.mykoboKycFlow.failure")} />;
  }

  return null;
};
