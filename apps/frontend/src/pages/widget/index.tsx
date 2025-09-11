import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { PIXKYCForm } from "../../components/BrlaComponents/BrlaExtendedForm";
import { SummaryPage } from "../../components/SummaryPage";
import { DetailsStep } from "../../components/widget-steps/DetailsStep";
import { MoneriumRedirectStep } from "../../components/widget-steps/MoneriumRedirectStep";
import { useAveniaKycActor, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";

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

  const { rampSummaryVisible } = useSelector(rampActor, state => ({
    rampSummaryVisible:
      state.matches("KycComplete") || state.matches("RegisterRamp") || state.matches("UpdateRamp") || state.matches("StartRamp")
  }));

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
    return <SummaryPage />;
  }

  if (aveniaKycActor) {
    return <PIXKYCForm />;
  }

  return <DetailsStep />;
};
