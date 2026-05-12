import { useCallback } from "react";
import { useMykoboKycActor, useMykoboKycSelector } from "../../contexts/rampState";
import type { MykoboKycFiles, MykoboKycFormData } from "../../machines/mykoboKyc.machine";
import { MykoboKycForm } from "./MykoboKycForm";

export const MykoboKycFlow = () => {
  const actor = useMykoboKycActor();
  const state = useMykoboKycSelector();

  const submitForm = useCallback(
    (formData: MykoboKycFormData, files: MykoboKycFiles) => actor?.send({ files, formData, type: "SubmitKycForm" }),
    [actor]
  );
  const cancel = useCallback(() => actor?.send({ type: "CANCEL" }), [actor]);

  if (!actor || !state) return null;

  const { stateValue, context } = state;

  if (stateValue === "CheckingProfile" || stateValue === "Submitting" || stateValue === "Verifying") {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body">Verifying your Mykobo profile…</p>
        <span className="loading loading-spinner" />
      </div>
    );
  }

  if (stateValue === "FormFilling") {
    return <MykoboKycForm onCancel={cancel} onSubmit={submitForm} />;
  }

  if (stateValue === "Done") {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body">KYC complete.</p>
      </div>
    );
  }

  if (stateValue === "Rejected") {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body text-red-700">Your KYC was rejected.</p>
        <p className="text-sm">{context.error?.message}</p>
      </div>
    );
  }

  if (stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center gap-2 p-6">
        <p className="text-body text-red-700">Something went wrong with KYC.</p>
        <p className="text-sm">{context.error?.message}</p>
      </div>
    );
  }

  return null;
};
