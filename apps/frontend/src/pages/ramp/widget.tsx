import { motion } from "motion/react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { BrlaSwapFields } from "../../components/BrlaComponents/BrlaSwapFields";
import { ConnectWalletButton } from "../../components/buttons/ConnectWalletButton";
import { QuoteSummary } from "../../components/QuoteSummary";
import { useRampForm } from "../../hooks/ramp/useRampForm";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useQuote } from "../../stores/quote/useQuoteStore";

function BrazilLanding() {
  const { t } = useTranslation();

  return (
    <div className="mx-auto flex w-full flex-col justify-center">
      <BrlaSwapFields />
      <button className="btn-vortex-primary btn mt-8 rounded-xl" type="submit">
        {t("pages.widget.details.buttons.next")}
      </button>
    </div>
  );
}

function EuroLanding() {
  return (
    <div className="mx-auto mt-12 flex w-full flex-col justify-center">
      <ConnectWalletButton customStyles="w-full btn-vortex-primary btn rounded-xl" hideIcon={true} />
    </div>
  );
}

export const WidgetDetailsPage = () => {
  const { t } = useTranslation();

  const quote = useQuote();
  const isBrazilLanding = quote?.from === "pix" || quote?.to === "pix";

  useSetRampUrlParams();
  const { form } = useRampForm();

  return (
    <FormProvider {...form}>
      <motion.form
        animate={{ opacity: 1, scale: 1 }}
        className="mx-4 mt-8 mb-4 min-h-[480px] rounded-lg px-4 pt-4 pb-2 shadow-custom md:mx-auto md:w-96"
        initial={{ opacity: 0, scale: 0.9 }}
        onSubmit={() => undefined}
        transition={{ duration: 0.3 }}
      >
        <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
        <div className="mt-8 mb-8 grid gap-3 px-2">{isBrazilLanding ? <BrazilLanding /> : <EuroLanding />}</div>
        <div className="mt-8 mb-8 grid gap-3 px-2">{quote && <QuoteSummary quote={quote} />}</div>
      </motion.form>
    </FormProvider>
  );
};
