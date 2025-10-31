import { isValidCnpj } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { AveniaKYBFlow } from "../../components/Avenia/AveniaKYBFlow";
import { AveniaKYBForm } from "../../components/Avenia/AveniaKYBForm";
import { AveniaKYCForm } from "../../components/Avenia/AveniaKYCForm";
import { DetailsStep } from "../../components/widget-steps/DetailsStep";
import { InitialQuoteFailedStep } from "../../components/widget-steps/InitialQuoteFailedStep";
import { MoneriumRedirectStep } from "../../components/widget-steps/MoneriumRedirectStep";
import { RampFollowUpRedirectStep } from "../../components/widget-steps/RampFollowUpRedirectStep";
import { SummaryStep } from "../../components/widget-steps/SummaryStep";
import { useAveniaKycActor, useAveniaKycSelector, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { useRampUrlParams } from "../../hooks/useRampUrlParams";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { QuoteContent } from "../quote";

export interface WidgetProps {
  className?: string;
}

export const Widget = ({ className }: WidgetProps) => (
  <motion.div
    animate={{ opacity: 1, scale: 1 }}
    className={cn(
      "relative mx-6 mt-8 mb-4 flex min-h-[620px] flex-col overflow-hidden rounded-lg px-6 pt-4 pb-2 shadow-custom md:mx-auto md:w-96",
      className
    )}
    initial={{ opacity: 0, scale: 0.9 }}
    transition={{ duration: 0.3 }}
  >
    <WidgetContent />
  </motion.div>
);

const WidgetContent = () => {
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const moneriumKycActor = useMoneriumKycActor();
  const aveniaState = useAveniaKycSelector();
  const isWidgetMode = useWidgetMode();
  const { providedQuoteId } = useRampUrlParams();

  const { rampState, isRedirectCallback } = useSelector(rampActor, state => ({
    isRedirectCallback: state.matches("RedirectCallback"),
    rampState: state.value
  }));

  const rampSummaryVisible =
    rampState === "KycComplete" || rampState === "RegisterRamp" || rampState === "UpdateRamp" || rampState === "StartRamp";

  const isMoneriumRedirect = useSelector(moneriumKycActor, state => {
    if (state) {
      return state.value === "Redirect";
    }
    return false;
  });

  const isInitialQuoteFailed = useSelector(rampActor, state => state.matches("InitialFetchFailed"));

  if (isWidgetMode && !providedQuoteId) {
    return <QuoteContent />;
  }

  if (isRedirectCallback) {
    return <RampFollowUpRedirectStep />;
  }

  if (isMoneriumRedirect) {
    return <MoneriumRedirectStep />;
  }

  if (rampSummaryVisible) {
    return <SummaryStep />;
  }

  if (aveniaKycActor) {
    const isCnpj = aveniaState?.context.taxId ? isValidCnpj(aveniaState.context.taxId) : false;

    if (isCnpj && aveniaState?.context.kybUrls) {
      return <AveniaKYBFlow />;
    }

    return isCnpj ? <AveniaKYBForm /> : <AveniaKYCForm />;
  }

  if (isInitialQuoteFailed) {
    return <InitialQuoteFailedStep />;
  }

  return <DetailsStep />;
};
