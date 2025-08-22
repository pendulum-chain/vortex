import { useSelector } from "@xstate/react";
import { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Step } from "../components/Stepper";
import { useRampActor } from "../contexts/rampState";

export const useStepper = () => {
  const { t } = useTranslation();
  const rampActor = useRampActor();

  const { rampKycStarted, rampPaymentConfirmed, rampSummaryVisible } = useSelector(rampActor, state => ({
    rampKycStarted: state.context.rampKycStarted,
    rampPaymentConfirmed: state.context.rampPaymentConfirmed,
    rampSummaryVisible: state.context.rampSummaryVisible
  }));

  const steps = useMemo((): Step[] => {
    return [
      {
        status: "active",
        title: t("stepper.details", "Details")
      },
      {
        status: rampSummaryVisible ? "complete" : rampKycStarted ? "active" : "incomplete",
        title: t("stepper.verification", "Verification")
      },
      {
        status: rampPaymentConfirmed ? "complete" : rampSummaryVisible ? "active" : "incomplete",
        title: t("stepper.confirm", "Confirm")
      }
    ];
  }, [t, rampKycStarted, rampPaymentConfirmed, rampSummaryVisible]);

  const currentStep = useMemo(() => {
    return steps.findIndex(step => step.status === "active");
  }, [steps]);

  return {
    currentStep: currentStep >= 0 ? currentStep : 0,
    steps
  };
};
