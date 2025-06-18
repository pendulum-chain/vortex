import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault } from "@packages/shared";
import { motion } from "motion/react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { FormProvider } from "react-hook-form";
import { useTranslation } from "react-i18next";

import { useEventsContext } from "../../../contexts/events";
import { useNetwork } from "../../../contexts/network";
import { useQuoteService } from "../../../hooks/ramp/useQuoteService";
import { useRampForm } from "../../../hooks/ramp/useRampForm";
import { useRampSubmission } from "../../../hooks/ramp/useRampSubmission";
import { useRampValidation } from "../../../hooks/ramp/useRampValidation";
import { useFeeComparisonStore } from "../../../stores/feeComparison";
import { useQuoteLoading } from "../../../stores/ramp/useQuoteStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../../stores/ramp/useRampFormStore";
import { useRampModalActions } from "../../../stores/rampModalStore";
import { useValidateTerms } from "../../../stores/termsStore";
import { AssetNumericInput } from "../../AssetNumericInput";
import { BenefitsList } from "../../BenefitsList";
import { BrlaSwapFields } from "../../BrlaComponents/BrlaSwapFields";
import { LabeledInput } from "../../LabeledInput";
import { RampErrorMessage } from "../../RampErrorMessage";
import { RampFeeCollapse } from "../../RampFeeCollapse";
import { RampSubmitButtons } from "../../RampSubmitButtons";
import { RampTerms } from "../../RampTerms";

export const Onramp = () => {
  const { t } = useTranslation();

  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
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
          registerInput={form.register("inputAmount")}
          tokenSymbol={fromToken.fiat.symbol}
          assetIcon={fromToken.fiat.assetIcon}
          onClick={() => openTokenSelectModal("from")}
          onChange={handleInputChange}
          id="inputAmount"
        />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange]
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.networkAssetIcon}
        tokenSymbol={toToken.assetSymbol}
        onClick={() => openTokenSelectModal("to")}
        registerInput={form.register("outputAmount")}
        loading={quoteLoading}
        disabled={!toAmount}
        readOnly={true}
        id="outputAmount"
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
        <LabeledInput label={t("components.swap.firstInputLabel.buy")} htmlFor="fromAmount" Input={WithdrawNumericInput} />
        <div className="my-10" />
        <LabeledInput label={t("components.swap.secondInputLabel")} htmlFor="toAmount" Input={ReceiveNumericInput} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <RampFeeCollapse />
        <section className="mt-5 flex w-full items-center justify-center">
          <BenefitsList />
        </section>
        <BrlaSwapFields />
        <RampErrorMessage />
        <section className="mt-5 w-full">
          <RampTerms />
        </section>
        <RampSubmitButtons toAmount={toAmount} />
      </motion.form>
    </FormProvider>
  );
};
