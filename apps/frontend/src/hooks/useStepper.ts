import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Step } from "../components/Stepper";
import { useRampPaymentConfirmed, useRampRegistered } from "../stores/rampStore";

export const useStepper = () => {
  const { t } = useTranslation();
  const rampRegistered = useRampRegistered();
  const rampPaymentConfirmed = useRampPaymentConfirmed();

  const steps = useMemo((): Step[] => {
    return [
      {
        status: "active",
        title: t("stepper.details", "Details")
      },
      {
        status: rampPaymentConfirmed ? "complete" : rampRegistered ? "active" : "incomplete",
        title: t("stepper.verification", "Verification")
      },
      {
        status: rampPaymentConfirmed ? "complete" : "incomplete",
        title: t("stepper.confirm", "Confirm")
      }
    ];
  }, [t, rampRegistered, rampPaymentConfirmed]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
