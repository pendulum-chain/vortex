import { motion } from "motion/react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { BrlaSwapFields } from "../../components/BrlaComponents/BrlaSwapFields";
import { ConnectWalletButton } from "../../components/buttons/ConnectWalletButton";
import { QuoteSummary } from "../../components/QuoteSummary";
import { RampFormValues } from "../../hooks/ramp/schema";
import { useRampForm } from "../../hooks/ramp/useRampForm";
import { useRampSubmission } from "../../hooks/ramp/useRampSubmission";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useQuote } from "../../stores/quote/useQuoteStore";

function NextButton({ onClick, type = "submit" }: { onClick?: () => void; type?: "button" | "submit" }) {
  const { t } = useTranslation();

  return (
    <button className="btn-vortex-primary btn mt-auto mb-4 rounded-xl" onClick={onClick} type={type}>
      {t("pages.widget.details.buttons.next")}
    </button>
  );
}

function BrazilLanding() {
  return (
    <div className="mx-auto flex h-full w-full flex-col justify-center">
      <BrlaSwapFields />
      <NextButton />
    </div>
  );
}

function EuroLanding() {
  return (
    <div className="mx-auto flex h-full w-full flex-col justify-center">
      <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon={true} />
      <NextButton />
    </div>
  );
}

export const WidgetDetailsPage = () => {
  useSetRampUrlParams();

  const { t } = useTranslation();
  const { form } = useRampForm();
  const quote = useQuote();

  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";

  const { onRampConfirm } = useRampSubmission();

  const handleConfirm = (data: RampFormValues) => {
    // TODO show add terms and conditions somewhere
    onRampConfirm();
  };

  return (
    <FormProvider {...form}>
      <motion.form
        animate={{ opacity: 1, scale: 1 }}
        className="mx-4 mt-8 mb-4 flex min-h-[480px] flex-col rounded-lg px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        onSubmit={form.handleSubmit(handleConfirm)}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
        <div className="mt-8 grid flex-grow gap-3 px-2">{isBrazilLanding ? <BrazilLanding /> : <EuroLanding />}</div>
        <div className="mt-auto mb-8 grid gap-3 px-2">{quote && <QuoteSummary quote={quote} />}</div>
      </motion.form>
    </FormProvider>
  );
};
