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
import { useValidateTerms } from "../../../stores/termsStore";
import { useTokenSelectionActions } from "../../../stores/tokenSelectionStore";
import { AssetNumericInput } from "../../AssetNumericInput";
import { BenefitsList } from "../../BenefitsList";
import { BrlaSwapFields } from "../../BrlaComponents/BrlaSwapFields";
import { LabeledInput } from "../../LabeledInput";
import { RampErrorMessage } from "../../RampErrorMessage";
import { RampFeeCollapse } from "../../RampFeeCollapse";
import { RampSubmitButtons } from "../../RampSubmitButtons";
import { RampTerms } from "../../RampTerms";
import { UserBalance } from "../../UserBalance";

export const Offramp = () => {
  const { t } = useTranslation();

  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const { outputAmount: toAmount } = useQuoteService(inputAmount, onChainToken, fiatToken);

  const quoteLoading = useQuoteLoading();

  // TODO: This is a hack to get the output amount to the form
  useEffect(() => {
    form.setValue("outputAmount", toAmount?.toFixed(2, 0) || "0");
  }, [toAmount, form]);

  const { getCurrentErrorMessage } = useRampValidation();
  const { onRampConfirm } = useRampSubmission();
  const validateTerms = useValidateTerms();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useTokenSelectionActions();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const toToken = getAnyFiatTokenDetails(fiatToken);

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

  const handleBalanceClick = useCallback((amount: string) => form.setValue("inputAmount", amount), [form]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          assetIcon={fromToken.networkAssetIcon}
          id="inputAmount"
          onChange={handleInputChange}
          onClick={() => openTokenSelectModal("from")}
          registerInput={form.register("inputAmount")}
          tokenSymbol={fromToken.assetSymbol}
        />
        <UserBalance onClick={handleBalanceClick} token={fromToken} />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange, handleBalanceClick]
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        disabled={!toAmount}
        id="outputAmount"
        loading={quoteLoading}
        onClick={() => openTokenSelectModal("to")}
        readOnly={true}
        registerInput={form.register("outputAmount")}
        tokenSymbol={toToken.fiat.symbol}
      />
    ),
    [toToken.fiat.assetIcon, toToken.fiat.symbol, quoteLoading, form, toAmount, openTokenSelectModal]
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
        <LabeledInput htmlFor="fromAmount" Input={WithdrawNumericInput} label={t("components.swap.firstInputLabel.sell")} />
        <div className="my-10" />
        <LabeledInput htmlFor="toAmount" Input={ReceiveNumericInput} label={t("components.swap.secondInputLabel")} />
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
