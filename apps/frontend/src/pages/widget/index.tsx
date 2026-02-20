import { isValidCnpj } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { AveniaKYBFlow } from "../../components/Avenia/AveniaKYBFlow";
import { AveniaKYBForm } from "../../components/Avenia/AveniaKYBForm";
import { AveniaKYCForm } from "../../components/Avenia/AveniaKYCForm";
import { HistoryMenu } from "../../components/menus/HistoryMenu";
import { SettingsMenu } from "../../components/menus/SettingsMenu";
import { AuthEmailStep } from "../../components/widget-steps/AuthEmailStep";
import { AuthOTPStep } from "../../components/widget-steps/AuthOTPStep";
import { DetailsStep } from "../../components/widget-steps/DetailsStep";
import { ErrorStep } from "../../components/widget-steps/ErrorStep";
import { InitialQuoteFailedStep } from "../../components/widget-steps/InitialQuoteFailedStep";
import { MoneriumRedirectStep } from "../../components/widget-steps/MoneriumRedirectStep";
import { RampFollowUpRedirectStep } from "../../components/widget-steps/RampFollowUpRedirectStep";
import { SummaryStep } from "../../components/widget-steps/SummaryStep";
import { useAveniaKycActor, useAveniaKycSelector, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { useAuthTokens } from "../../hooks/useAuthTokens";

export interface WidgetProps {
  className?: string;
}

export const Widget = ({ className }: WidgetProps) => (
  <motion.div
    animate={{ opacity: 1, scale: 1 }}
    className={cn(
      "relative mx-6 mt-8 mb-4 flex min-h-[620px] flex-col overflow-hidden rounded-lg bg-white px-6 pt-4 pb-2 shadow-custom md:mx-auto md:w-96",
      className
    )}
    initial={{ opacity: 0, scale: 0.9 }}
    transition={{ duration: 0.3 }}
  >
    <WidgetContent />
    <SettingsMenu />
    <HistoryMenu />
  </motion.div>
);

const WidgetContent = () => {
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const moneriumKycActor = useMoneriumKycActor();
  const aveniaState = useAveniaKycSelector();

  // Enable session persistence and auto-refresh
  useAuthTokens(rampActor);

  const { rampState, isRedirectCallback, isError } = useSelector(rampActor, state => ({
    isError: state.matches("Error"),
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

  const isAuthEmail = useSelector(
    rampActor,
    state =>
      state.matches("CheckAuth") ||
      state.matches("EnterEmail") ||
      state.matches("CheckingEmail") ||
      state.matches("RequestingOTP")
  );

  const isAuthOTP = useSelector(rampActor, state => state.matches("EnterOTP") || state.matches("VerifyingOTP"));

  if (isError) {
    return <ErrorStep />;
  }

  if (isRedirectCallback) {
    return <RampFollowUpRedirectStep />;
  }

  if (isAuthEmail) {
    return <AuthEmailStep />;
  }

  if (isAuthOTP) {
    return <AuthOTPStep />;
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
