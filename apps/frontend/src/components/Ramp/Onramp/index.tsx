import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault } from "@packages/shared";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useEventsContext } from "../../../contexts/events";
import { useNetwork } from "../../../contexts/network";
import { useQuoteForm } from "../../../hooks/quote/useQuoteForm";
import { useQuoteService } from "../../../hooks/quote/useQuoteService";
import { useRampSubmission } from "../../../hooks/ramp/useRampSubmission";
import { useRampValidation } from "../../../hooks/ramp/useRampValidation";
import { useFeeComparisonStore } from "../../../stores/feeComparison";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../../stores/quote/useQuoteFormStore";
import { useQuoteLoading } from "../../../stores/quote/useQuoteStore";
import { useRampModalActions } from "../../../stores/rampModalStore";
import { useValidateTerms } from "../../../stores/termsStore";
import { AssetNumericInput } from "../../AssetNumericInput";
import { BenefitsList } from "../../BenefitsList";
import { LabeledInput } from "../../LabeledInput";
import { QuoteSubmitButton } from "../../QuoteSubmitButtons";
import { RampErrorMessage } from "../../RampErrorMessage";
import { RampFeeCollapse } from "../../RampFeeCollapse";

export const Onramp = () => {
  const { t } = useTranslation();

  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useQuoteForm();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const quoteLoading = useQuoteLoading();

  const { outputAmount: toAmount } = useQuoteService(inputAmount, onChainToken, fiatToken);
  // TODO: This is a hack to get the output amount to the form
  useEffect(() => {
    form.setValue("outputAmount", toAmount?.toFixed(6, 0) || "0");
  }, [toAmount, form]);

  const { getCurrentErrorMessage } = useRampValidation();
  const validateTerms = useValidateTerms();
  const { onRampConfirm } = useRampSubmission();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useRampModalActions();

  const fromToken = getAnyFiatTokenDetails(fiatToken);
  const toToken = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);

  useEffect(() => {
    if (!fromAmountFieldTouched || !inputAmount) return;

    trackEvent({
      event: "amount_type",
      input_amount: inputAmount.toString()
    });
  }, [fromAmountFieldTouched, inputAmount, trackEvent]);

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    setTrackPrice(true);
  }, [setTrackPrice]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          assetIcon={fromToken.fiat.assetIcon}
          id="inputAmount"
          onChange={handleInputChange}
          onClick={() => openTokenSelectModal("from")}
          registerInput={form.register("inputAmount")}
          tokenSymbol={fromToken.fiat.symbol}
        />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange]
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.networkAssetIcon}
        disabled={!toAmount}
        id="outputAmount"
        loading={quoteLoading}
        onClick={() => openTokenSelectModal("to")}
        readOnly={true}
        registerInput={form.register("outputAmount")}
        tokenSymbol={toToken.assetSymbol}
      />
    ),
    [toToken.networkAssetIcon, toToken.assetSymbol, form, quoteLoading, toAmount, openTokenSelectModal]
  );

  const handleConfirm = useCallback(() => {
    if (!validateTerms()) {
      return;
    }

    onRampConfirm();
  }, [onRampConfirm, validateTerms]);

  return (
    <FormProvider {...form}>
      <motion.form onSubmit={form.handleSubmit(handleConfirm)}>
        <LabeledInput htmlFor="fromAmount" Input={WithdrawNumericInput} label={t("components.swap.firstInputLabel.buy")} />
        <div className="my-10" />
        <LabeledInput htmlFor="toAmount" Input={ReceiveNumericInput} label={t("components.swap.secondInputLabel")} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <RampFeeCollapse />
        <section className="mt-5 flex w-full items-center justify-center">
          <BenefitsList />
        </section>
        <RampErrorMessage />
        <QuoteSubmitButton className="mt-4" />
      </motion.form>
    </FormProvider>
  );
};
