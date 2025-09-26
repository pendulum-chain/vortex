import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { AveniaKYBForm } from "../../components/Avenia/AveniaKYBForm";
import { AveniaKYCForm } from "../../components/Avenia/AveniaKYCForm";
import { DetailsStep } from "../../components/widget-steps/DetailsStep";
import { MoneriumRedirectStep } from "../../components/widget-steps/MoneriumRedirectStep";
import { SummaryStep } from "../../components/widget-steps/SummaryStep";
import { useAveniaKycActor, useAveniaKycSelector, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { isValidCnpj } from "../../hooks/ramp/schema";

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

  const rampState = useSelector(rampActor, state => state.value);

  const rampSummaryVisible =
    rampState === "KycComplete" || rampState === "RegisterRamp" || rampState === "UpdateRamp" || rampState === "StartRamp";

  const isMoneriumRedirect = useSelector(moneriumKycActor, state => {
    if (state) {
      return state.value === "Redirect";
    }
    return false;
  });

  if (isMoneriumRedirect) {
    return <MoneriumRedirectStep />;
  }

  if (rampSummaryVisible) {
    return <SummaryStep />;
  }

  if (aveniaKycActor) {
    const isCnpj = aveniaState?.context.taxId ? isValidCnpj(aveniaState.context.taxId) : false;
    return isCnpj ? <AveniaKYBForm /> : <AveniaKYCForm />;
  }

  return <DetailsStep />;
};
