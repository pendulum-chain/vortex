import * as Sentry from "@sentry/react";
import { isValidCnpj } from "@vortexfi/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { AlfredpayKycFlow } from "../../components/Alfredpay/AlfredpayKycFlow";
import { LoadingScreen } from "../../components/Alfredpay/LoadingScreen";
import { AveniaKYBFlow } from "../../components/Avenia/AveniaKYBFlow";
import { AveniaKYBForm } from "../../components/Avenia/AveniaKYBForm";
import { AveniaKYCForm } from "../../components/Avenia/AveniaKYCForm";
import { DoneScreen } from "../../components/DoneScreen";
import { MykoboKycFlow } from "../../components/Mykobo/MykoboKycFlow";
import { HistoryMenu } from "../../components/menus/HistoryMenu";
import { SettingsMenu } from "../../components/menus/SettingsMenu";
import { AuthEmailStep } from "../../components/widget-steps/AuthEmailStep";
import { AuthOTPStep } from "../../components/widget-steps/AuthOTPStep";
import { DetailsStep } from "../../components/widget-steps/DetailsStep";
import { ErrorStep } from "../../components/widget-steps/ErrorStep";
import { InitialQuoteFailedStep } from "../../components/widget-steps/InitialQuoteFailedStep";
import { RampFollowUpRedirectStep } from "../../components/widget-steps/RampFollowUpRedirectStep";
import { RegionSelectStep } from "../../components/widget-steps/RegionSelectStep";
import { SummaryStep } from "../../components/widget-steps/SummaryStep";
import { FiatAccountMachineContext, useFiatAccountSelector } from "../../contexts/FiatAccountMachineContext";
import {
  useAlfredpayKycActor,
  useAlfredpayKycSelector,
  useAveniaKycActor,
  useAveniaKycSelector,
  useMykoboKycActor,
  useRampActor
} from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { useAuthTokens } from "../../hooks/useAuthTokens";
import { isInCompoundState } from "../../machines/types";
import { FiatAccountRegistration } from "../alfredpay/FiatAccountRegistration";

export interface WidgetProps {
  className?: string;
}

const WidgetErrorFallback = ({ onReset }: { onReset: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col items-center gap-4 py-10 text-center">
      <p className="text-body">{t("toasts.genericError")}</p>
      <button className="btn btn-vortex-primary" onClick={onReset} type="button">
        {t("components.errorStep.retryButton")}
      </button>
    </div>
  );
};

export const Widget = ({ className }: WidgetProps) => (
  <FiatAccountMachineContext.Provider>
    <div
      className={cn(
        "relative mx-6 mt-8 mb-4 flex min-h-[var(--widget-min-height)] flex-col rounded-lg bg-white px-6 pt-4 pb-2 shadow-custom md:mx-auto md:w-96",
        className
      )}
    >
      <Sentry.ErrorBoundary fallback={({ resetError }) => <WidgetErrorFallback onReset={resetError} />}>
        <WidgetContent />
      </Sentry.ErrorBoundary>
      <SettingsMenu />
      <HistoryMenu />
    </div>
  </FiatAccountMachineContext.Provider>
);

const WidgetContent = () => {
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const alfredpayKycActor = useAlfredpayKycActor();
  const mykoboKycActor = useMykoboKycActor();

  const showFiatAccountRegistration = useFiatAccountSelector(s => s.matches("Open"));
  const fiatRegistrationCountry = useFiatAccountSelector(s => s.context.fiatRegistrationCountry);

  // Enable session persistence and auto-refresh
  useAuthTokens(rampActor);

  const {
    rampState,
    isRedirectCallback,
    isError,
    isInitialQuoteFailed,
    isAuthEmail,
    isLoadingAuthEmail,
    isAuthOTP,
    isSelectRegion,
    isKybComplete,
    isKybLinkMode,
    kybCustomerType
  } = useSelector(rampActor, state => ({
    isAuthEmail: state.matches("EnterEmail") || state.matches("CheckingEmail") || state.matches("RequestingOTP"),
    isAuthOTP: state.matches("EnterOTP") || state.matches("VerifyingOTP"),
    isError: state.matches("Error"),
    isInitialQuoteFailed: state.matches("InitialFetchFailed"),
    isKybComplete: state.matches("KybLinkComplete"),
    isKybLinkMode: !!state.context.kybLink,
    isLoadingAuthEmail: state.matches("CheckAuth") || state.matches("RedeemingInvite"),
    isRedirectCallback: state.matches("RedirectCallback"),
    isSelectRegion: state.matches("SelectRegion"),
    kybCustomerType: state.context.kybLink?.customerType,
    rampState: state.value
  }));

  const rampSummaryVisible =
    rampState === "KycComplete" || rampState === "RegisterRamp" || rampState === "UpdateRamp" || rampState === "StartRamp";

  if (isLoadingAuthEmail) {
    return <LoadingScreen />;
  }

  if (isError) {
    return <ErrorStep />;
  }

  if (isKybComplete) {
    // The invite's recipient type picks the wording: an invited individual completed KYC, not KYB.
    return (
      <DoneScreen
        kycOrKyb={kybCustomerType === "individual" ? "KYC" : "KYB"}
        onContinue={() => rampActor.send({ type: "RESET_RAMP" })}
      />
    );
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

  if (isSelectRegion) {
    return <RegionSelectStep />;
  }

  if (rampSummaryVisible) {
    if (showFiatAccountRegistration && fiatRegistrationCountry) {
      return <FiatAccountRegistration kycApproved={true} preselectedCountry={fiatRegistrationCountry} />;
    }
    return <SummaryStep />;
  }

  if (aveniaKycActor) {
    const isCnpj = aveniaState?.context.taxId ? isValidCnpj(aveniaState.context.taxId) : false;
    const treatAsKyb = isCnpj || (isKybLinkMode && kybCustomerType === "business");

    const isInKybFlow = treatAsKyb && isInCompoundState(aveniaState?.stateValue, "KYBFlow");

    if (isInKybFlow) {
      return <AveniaKYBFlow />;
    }

    return treatAsKyb ? <AveniaKYBForm /> : <AveniaKYCForm />;
  }

  if (alfredpayKycActor) {
    return <AlfredpayKycFlow />;
  }

  if (mykoboKycActor) {
    return <MykoboKycFlow />;
  }

  if (isInitialQuoteFailed) {
    return <InitialQuoteFailedStep />;
  }

  return <DetailsStep />;
};
