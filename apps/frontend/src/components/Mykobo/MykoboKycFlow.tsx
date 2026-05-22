import { type ReactNode, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { useMykoboKycActor, useMykoboKycSelector } from "../../contexts/rampState";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";
import type { MykoboKycSnapshot } from "../../machines/types";
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

  const panels: Record<MykoboKycSnapshot["value"], () => ReactNode> = {
    CheckingProfile: () => <LoadingPanel message={t("components.mykoboKycFlow.checkingProfile")} />,
    Done: () => (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body">{t("components.mykoboKycFlow.done")}</p>
      </div>
    ),
    Failure: () => <ErrorPanel detail={context.error?.message} message={t("components.mykoboKycFlow.failure")} />,
    FormFilling: () => <MykoboKycForm onSubmit={submitForm} />,
    Rejected: () => <ErrorPanel detail={context.error?.message} message={t("components.mykoboKycFlow.rejected")} />,
    Submitting: () => <LoadingPanel message={t("components.mykoboKycFlow.submitting")} />,
    Verifying: () => <LoadingPanel message={t("components.mykoboKycFlow.verifying")} />
  };

  return panels[stateValue]();
};
