import { QuoteResponse } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PIXKYCForm } from "../../components/BrlaComponents/BrlaExtendedForm";
import { BrlaSwapFields } from "../../components/BrlaComponents/BrlaSwapFields";
import { ConnectWalletButton } from "../../components/buttons/ConnectWalletButton";
import { DetailsDescription } from "../../components/DetailsDescription";
import { MenuButtons } from "../../components/MenuButtons";
import { MoneriumRedirectComponent } from "../../components/MoneriumComponents/MoneriumRedirectComponent";
import { QuoteSummary } from "../../components/QuoteSummary";
import { RampSubmitButton } from "../../components/RampSubmitButton/RampSubmitButton";
import { RampSummaryCard } from "../../components/RampSummaryCard";
import { SigningBoxButton, SigningBoxContent } from "../../components/SigningBox/SigningBoxContent";
import { useAveniaKycActor, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { useRampForm } from "../../hooks/ramp/useRampForm";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useSigningBoxState } from "../../hooks/useSigningBoxState";
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
  const { address } = useVortexAccount();
  const isConnected = !!address;

  return (
    <div className="mx-auto flex h-full w-full flex-col justify-center gap-4">
      <DetailsDescription />
      {isConnected ? (
        <div className="flex flex-col gap-4">
          <ConnectWalletButton customStyles="w-full btn-vortex-secondary rounded-xl" hideIcon={false} />
        </div>
      ) : (
        <ConnectWalletButton customStyles="w-full btn-vortex-primary rounded-xl" hideIcon={true} />
      )}
    </div>
  );
}

function WidgetForm() {
  const { shouldDisplay: signingBoxVisible, progress, signatureState, confirmations } = useSigningBoxState();

  const { address } = useVortexAccount();
  const taxId = useTaxId();
  const pixId = usePixId();

  const { form } = useRampForm({
    pixId,
    taxId,
    walletAddress: address
  });

  const { onRampConfirm } = useRampSubmission();
  const quote = useQuote();
  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";

  return (
    <FormProvider {...form}>
      <form className="flex grow flex-col" onSubmit={form.handleSubmit(data => onRampConfirm(data))}>
        <WidgetFormHeader />
        <WidgetFormDetails isBrazilLanding={isBrazilLanding} />
        {signingBoxVisible && (
          <div className="mx-auto mt-6 max-w-[320px]">
            <SigningBoxContent progress={progress} />
          </div>
        )}
        <WidgetFormActions
          confirmations={confirmations}
          signatureState={signatureState}
          signingBoxVisible={signingBoxVisible}
        />
      </form>
      <WidgetFormQuoteSummary quote={quote} />
    </FormProvider>
  );
}

function WidgetFormHeader() {
  const { t } = useTranslation();
  return (
    <div className="flex items-center justify-between">
      <div className="flex-1 text-center">
        <h1 className="font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
      </div>
      <MenuButtons />
    </div>
  );
}

function WidgetFormDetails({ isBrazilLanding }: { isBrazilLanding: boolean }) {
  return <div className="mt-8 grid flex-grow gap-3">{isBrazilLanding ? <BrazilDetails /> : <EuroDetails />}</div>;
}

function WidgetFormActions({
  signingBoxVisible,
  signatureState,
  confirmations
}: {
  signingBoxVisible: boolean;
  signatureState: { current: number; max: number };
  confirmations: { current: number; required: number };
}) {
  if (signingBoxVisible) {
    return (
      <div className="flex grow text-center">
        <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
      </div>
    );
  }
  return <RampSubmitButton className="mb-4" />;
}

function WidgetFormQuoteSummary({ quote }: { quote: QuoteResponse | undefined }) {
  if (!quote) return null;

  return (
    <div className="mt-auto mb-2">
      <QuoteSummary quote={quote} />
    </div>
  );
}

export const WidgetCards = () => (
  <motion.div
    animate={{ opacity: 1, scale: 1 }}
    className="relative mx-6 mt-8 mb-4 flex min-h-[620px] flex-col overflow-hidden rounded-lg px-6 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
    initial={{ opacity: 0, scale: 0.9 }}
    transition={{ duration: 0.3 }}
  >
    <WidgetCardsContent />
  </motion.div>
);

function WidgetCardsContent() {
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
    return <MoneriumRedirectComponent />;
  }
  if (rampSummaryVisible) {
    return <RampSummaryCard />;
  }
  if (aveniaKycActor) {
    return <PIXKYCForm />;
  }

  return <WidgetForm />;
}
