import { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FormProvider } from 'react-hook-form';
import { useTranslation } from 'react-i18next';

import { LabeledInput } from '../../LabeledInput';
import { BrlaSwapFields } from '../../BrlaComponents/BrlaSwapFields';
import { AssetNumericInput } from '../../AssetNumericInput';
import { UserBalance } from '../../UserBalance';
import { BenefitsList } from '../../BenefitsList';
import { useEventsContext } from '../../../contexts/events';
import { useNetwork } from '../../../contexts/network';
import { useDebouncedValue } from '../../../hooks/useDebouncedValue';
import { getAnyFiatTokenDetails, getOnChainTokenDetailsOrDefault } from 'shared';
import { useRampValidation } from '../../../hooks/ramp/useRampValidation';
import { useRampSubmission } from '../../../hooks/ramp/useRampSubmission';
import { useFeeComparisonStore } from '../../../stores/feeComparison';
import { useRampForm } from '../../../hooks/ramp/useRampForm';
import { RampTerms } from '../../RampTerms';
import { useValidateTerms } from '../../../stores/termsStore';
import { useRampModalActions } from '../../../stores/rampModalStore';
import { useFiatToken, useInputAmount, useOnChainToken } from '../../../stores/ramp/useRampFormStore';
import { RampFeeCollapse } from '../../RampFeeCollapse';
import { RampSubmitButtons } from '../../RampSubmitButtons';
import { useQuoteService } from '../../../hooks/ramp/useQuoteService';

import { useQuoteLoading } from '../../../stores/ramp/useQuoteStore';
import { RampErrorMessage } from '../../RampErrorMessage';

export const Offramp = () => {
  const { t } = useTranslation();

  const { setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const debouncedInputAmount = useDebouncedValue(inputAmount, 1000);
  const { outputAmount: toAmount } = useQuoteService(debouncedInputAmount, onChainToken, fiatToken);

  const quoteLoading = useQuoteLoading();

  // TODO: This is a hack to get the output amount to the form
  useEffect(() => {
    form.setValue('outputAmount', toAmount?.toString() || '0');
  }, [toAmount, form]);

  const { getCurrentErrorMessage } = useRampValidation();
  const { onRampConfirm } = useRampSubmission();
  const validateTerms = useValidateTerms();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useRampModalActions();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, onChainToken);
  const toToken = getAnyFiatTokenDetails(fiatToken);

  useEffect(() => {
    if (!fromAmountFieldTouched || debouncedInputAmount !== inputAmount) return;

    trackEvent({
      event: 'amount_type',
      input_amount: debouncedInputAmount ? debouncedInputAmount.toString() : '0',
    });
  }, [fromAmountFieldTouched, debouncedInputAmount, inputAmount, trackEvent]);

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    setTrackPrice(true);
  }, [setTrackPrice]);

  const handleBalanceClick = useCallback((amount: string) => form.setValue('inputAmount', amount), [form]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('inputAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={handleInputChange}
          id="inputAmount"
        />
        <UserBalance token={fromToken} onClick={handleBalanceClick} />
      </>
    ),
    [form, fromToken, openTokenSelectModal, handleInputChange, handleBalanceClick],
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => openTokenSelectModal('to')}
        loading={quoteLoading}
        registerInput={form.register('outputAmount')}
        disabled={!toAmount}
        readOnly={true}
        id="outputAmount"
      />
    ),
    [toToken.fiat.assetIcon, toToken.fiat.symbol, quoteLoading, form, toAmount, openTokenSelectModal],
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
        <LabeledInput
          label={t('components.swap.firstInputLabel.sell')}
          htmlFor="fromAmount"
          Input={WithdrawNumericInput}
        />
        <div className="my-10" />
        <LabeledInput label={t('components.swap.secondInputLabel')} htmlFor="toAmount" Input={ReceiveNumericInput} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <RampFeeCollapse />
        <section className="flex items-center justify-center w-full mt-5">
          <BenefitsList />
        </section>
        <BrlaSwapFields />
        <RampErrorMessage />
        <section className="w-full mt-5">
          <RampTerms />
        </section>
        <RampSubmitButtons toAmount={toAmount} />
      </motion.form>
    </FormProvider>
  );
};
