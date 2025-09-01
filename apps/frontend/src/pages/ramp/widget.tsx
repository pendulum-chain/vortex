import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PIXKYCForm } from "../../components/BrlaComponents/BrlaExtendedForm";
import { BrlaSwapFields } from "../../components/BrlaComponents/BrlaSwapFields";
import { ConnectWalletButton } from "../../components/buttons/ConnectWalletButton";
import { MoneriumRedirectComponent } from "../../components/MoneriumComponents/MoneriumRedirectComponent";
import { QuoteSummary } from "../../components/QuoteSummary";
import { RampSubmitButton } from "../../components/RampSubmitButton/RampSubmitButton";
import { RampSummaryCard } from "../../components/RampSummaryCard";
import { useAveniaKycActor, useMoneriumKycActor, useRampActor, useRampStateSelector } from "../../contexts/rampState";
import { useRampForm } from "../../hooks/ramp/useRampForm";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useVortexAccount } from "../../hooks/useVortexAccount";
import { usePixId, useTaxId } from "../../stores/quote/useQuoteFormStore";
import { useQuote } from "../../stores/quote/useQuoteStore";

function BrazilDetails() {
  return (
    <div className="mx-auto flex h-full w-full flex-col justify-center">
      <BrlaSwapFields />
    </div>
  );
}

function EuroDetails() {
  return (
    <div className="mx-auto flex h-full w-full flex-col justify-center">
      <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon={true} />
    </div>
  );
}

export const WidgetCards = () => {
  const { t } = useTranslation();
  const { address } = useVortexAccount();
  const taxId = useTaxId();
  const pixId = usePixId();

  const { form } = useRampForm({
    pixId,
    taxId,
    walletAddress: address
  });
  const quote = useQuote();

  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const moneriumKycActor = useMoneriumKycActor();
  const { rampSummaryVisible } = useSelector(rampActor, state => ({
    rampSummaryVisible: state.context.rampSummaryVisible
  }));

  const isMoneriumRedirect = useSelector(moneriumKycActor, state => {
    if (state) {
      return state.value === "Redirect";
    }
    return false;
  });
  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";

  const { onRampConfirm } = useRampSubmission();

  return (
    <motion.div
      animate={{ opacity: 1, scale: 1 }}
      className="mx-6 mt-8 mb-4 flex min-h-[480px] flex-col rounded-lg px-6 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
      initial={{ opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.3 }}
    >
      {isMoneriumRedirect ? (
        <MoneriumRedirectComponent />
      ) : rampSummaryVisible ? (
        <RampSummaryCard />
      ) : aveniaKycActor ? (
        <PIXKYCForm />
      ) : (
        <FormProvider {...form}>
          <form className="flex grow flex-col" onSubmit={form.handleSubmit(data => onRampConfirm(data))}>
            <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
            <div className="mt-8 grid flex-grow gap-3 px-2">{isBrazilLanding ? <BrazilDetails /> : <EuroDetails />}</div>
            <RampSubmitButton className="mb-4" />
          </form>
          <div className="mt-auto mb-2">{quote && <QuoteSummary quote={quote} />}</div>
        </FormProvider>
      )}
    </motion.div>
  );
};
