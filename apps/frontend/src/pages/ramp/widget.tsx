import { QuoteResponse } from "@packages/shared";
import { useSelector } from "@xstate/react";
import { motion } from "motion/react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { PIXKYCForm } from "../../components/BrlaComponents/BrlaExtendedForm";
import { BrlaSwapFields } from "../../components/BrlaComponents/BrlaSwapFields";
import { ConnectWalletButton, WalletButtonVariant } from "../../components/buttons/ConnectWalletButton";
import { DetailsDescription } from "../../components/DetailsDescription";
import { MenuButtons } from "../../components/MenuButtons";
import { MoneriumRedirectComponent } from "../../components/MoneriumComponents/MoneriumRedirectComponent";
import { QuoteSummary } from "../../components/QuoteSummary";
import { RampSubmitButton } from "../../components/RampSubmitButton/RampSubmitButton";
import { SigningBoxButton, SigningBoxContent } from "../../components/SigningBox/SigningBoxContent";
import { SummaryPage } from "../../components/SummaryPage";
import { useAveniaKycActor, useMoneriumKycActor, useRampActor } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
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

function ConnectWalletButtonWrapper() {
  const { isConnected } = useVortexAccount();

  return (
    <div className={cn("mb-4 w-full ", isConnected && "mb-2")}>
      {isConnected ? (
        <ConnectWalletButton customStyles="w-full" variant={WalletButtonVariant.Minimal} />
      ) : (
        <ConnectWalletButton customStyles="w-full" hideIcon />
      )}
    </div>
  );
}

function DetailsPage() {
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
    <div>
      <MenuButtons />
      <div className="mt-4 text-center">
        <h1 className="mb-4 font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
        <DetailsDescription />
      </div>
    </div>
  );
}

function WidgetFormDetails({ isBrazilLanding }: { isBrazilLanding: boolean }) {
  return <div className="mt-8 grid flex-grow gap-3">{isBrazilLanding && <BrazilDetails />}</div>;
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
  const { isConnected } = useVortexAccount();

  if (signingBoxVisible) {
    return (
      <div className="flex grow text-center">
        <SigningBoxButton confirmations={confirmations} signatureState={signatureState} />
      </div>
    );
  }

  return (
    <>
      <ConnectWalletButtonWrapper />
      {isConnected && <RampSubmitButton className="mb-4" />}
    </>
  );
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
    return <SummaryPage />;
  }
  if (aveniaKycActor) {
    return <PIXKYCForm />;
  }

  return <DetailsPage />;
}
