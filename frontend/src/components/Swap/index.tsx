import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FormProvider } from 'react-hook-form';

import { LabeledInput } from '../LabeledInput';
import { BrlaSwapFields } from '../BrlaComponents/BrlaSwapFields';
import { AssetNumericInput } from '../AssetNumericInput';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';
import { PoweredBy } from '../PoweredBy';
import { UserBalance } from '../UserBalance';
import { BenefitsList } from '../BenefitsList';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { useQuoteService } from '../../hooks/ramp/useQuoteService';
import { useRampValidation } from '../../hooks/ramp/useRampValidation';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampSummaryVisible } from '../../stores/offrampStore';
import { useFeeComparisonStore } from '../../stores/feeComparison';
import { useRampForm } from '../../hooks/ramp/useRampForm';
import { RampTerms } from '../RampTerms';
import { useValidateTerms } from '../../stores/termsStore';
import { useRampModalActions } from '../../stores/rampModalStore';
import { useFromToken, useFromAmount, useToToken } from '../../stores/ramp/useRampFormStore';
import { useSwapUrlParams } from '../../hooks/useRampUrlParams';
import { RampFeeCollapse } from '../RampFeeCollapse';

enum SwapButtonState {
  CONFIRMING = 'Confirming',
  PROCESSING = 'Processing',
  CONFIRM = 'Confirm',
}

export const Swap = () => {
  const { feeComparisonRef, setTrackPrice } = useFeeComparisonStore();

  const { form } = useRampForm();
  const from = useFromToken();
  const to = useToToken();
  const fromAmount = useFromAmount();

  const { outputAmount: toAmount } = useQuoteService(fromAmount, from, to);
  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const { onSwapConfirm } = useRampSubmission();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();

  const validateTerms = useValidateTerms();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();

  const { openTokenSelectModal } = useRampModalActions();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);

  const debouncedFromAmount = useDebouncedValue(fromAmount, 1000);

  useSwapUrlParams({ form });

  useEffect(() => {
    if (!fromAmountFieldTouched || debouncedFromAmount !== fromAmount) return;

    trackEvent({
      event: 'amount_type',
      input_amount: debouncedFromAmount ? debouncedFromAmount.toString() : '0',
    });
  }, [fromAmountFieldTouched, debouncedFromAmount, fromAmount, trackEvent]);

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    setTrackPrice(true);
  }, [setTrackPrice]);

  const handleBalanceClick = useCallback((amount: string) => form.setValue('fromAmount', amount), [form]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('fromAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={handleInputChange}
          id="fromAmount"
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
        registerInput={form.register('toAmount')}
        disabled={!toAmount}
        readOnly={true}
        id="toAmount"
      />
    ),
    [toToken.fiat.assetIcon, toToken.fiat.symbol, form, toAmount, openTokenSelectModal],
  );

  const handleCompareFeesClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setTimeout(() => {
        feeComparisonRef?.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);

      trackEvent({
        event: 'compare_quote',
      });
    },
    [feeComparisonRef, trackEvent],
  );

  const handleConfirm = useCallback(() => {
    if (!validateTerms()) {
      return;
    }

    onSwapConfirm();
  }, [onSwapConfirm, validateTerms]);

  const getButtonState = (): SwapButtonState => {
    if (isOfframpSummaryDialogVisible) {
      return SwapButtonState.PROCESSING;
    }
    return SwapButtonState.CONFIRM;
  };

  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !toAmount || !!initializeFailedMessage;

  const isSubmitButtonPending = isOfframpSummaryDialogVisible;

  return (
    <FormProvider {...form}>
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
        onSubmit={form.handleSubmit(handleConfirm)}
      >
        <h1 className="mt-2 mb-5 text-3xl font-bold text-center text-blue-700">Sell Crypto</h1>
        <LabeledInput label="You sell" htmlFor="fromAmount" Input={WithdrawNumericInput} />
        <div className="my-10" />
        <LabeledInput label="You receive" htmlFor="toAmount" Input={ReceiveNumericInput} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <RampFeeCollapse />
        <section className="flex items-center justify-center w-full mt-5">
          <BenefitsList amount={fromAmount} currency={from} />
        </section>
        <BrlaSwapFields toToken={to} />
        {initializeFailedMessage && (
          <section className="flex justify-center w-full mt-5">
            <div className="flex items-center gap-4">
              <p className="text-red-600">{initializeFailedMessage}</p>
            </div>
          </section>
        )}

        <section className="w-full mt-5">
          <RampTerms />
        </section>

        <div className="flex gap-3 mt-5">
          <button
            className="btn-vortex-primary-inverse btn"
            style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
            onClick={handleCompareFeesClick}
          >
            Compare fees
          </button>
          <SwapSubmitButton text={getButtonState()} disabled={isSubmitButtonDisabled} pending={isSubmitButtonPending} />
        </div>
        <div className="mb-16" />
        <PoweredBy />
      </motion.form>
    </FormProvider>
  );
};
