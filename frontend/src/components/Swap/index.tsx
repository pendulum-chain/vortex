import React, {  useCallback, useEffect, useMemo, useState, useRef } from 'react';
import { motion } from 'motion/react';
import { FormProvider } from 'react-hook-form';

import { LabeledInput } from '../LabeledInput';
import { FeeCollapse } from '../FeeCollapse';
import { BrlaSwapFields } from '../BrlaComponents/BrlaSwapFields';
import { AssetNumericInput } from '../AssetNumericInput';
import { TermsAndConditions } from '../TermsAndConditions';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';
import { PoweredBy } from '../PoweredBy';
import { UserBalance } from '../UserBalance';
import { ExchangeRate } from '../ExchangeRate';
import { BenefitsList } from '../BenefitsList';
import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { useTermsAndConditions } from '../../hooks/useTermsAndConditions';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails } from 'shared';
import { useQuoteService } from '../../hooks/ramp/useQuoteService';
import { useTokenSelection } from '../../hooks/ramp/useTokenSelection';
import { useRampForm } from '../../stores/ramp/useRampFormStore';
import { useRampValidation } from '../../hooks/ramp/useRampValidation';
import { useRampSubmission } from '../../hooks/ramp/useRampSubmission';
import { useRampSummaryVisible } from '../../stores/offrampStore';

// Enum for different button states
enum SwapButtonState {
  CONFIRMING = 'Confirming',
  PROCESSING = 'Processing',
  CONFIRM = 'Confirm',
}

/**
 * Refactored Swap component that accesses stores and hooks directly
 * No longer relies on props passed from parent component
 */
export const Swap = () => {
  // Get references
  const feeComparisonRef = useRef<HTMLDivElement | null>(null);
  const trackPrice = useRef(false);

  // Access hooks and stores directly
  const { form, fromAmount, from, to } = useRampForm();
  const { outputAmount: toAmount, exchangeRate } = useQuoteService(fromAmount, from, to);
  const { getCurrentErrorMessage, initializeFailedMessage } = useRampValidation();
  const { onSwapConfirm } = useRampSubmission();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();

  // Local state
  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);
  const [termsAnimationKey, setTermsAnimationKey] = useState(0);

  // Get hooks
  const { trackEvent } = useEventsContext();
  const { selectedNetwork } = useNetwork();
  const { toggleTermsChecked, termsChecked, termsAccepted, termsError, setTermsError } = useTermsAndConditions();
  const { openTokenSelectModal } = useTokenSelection();

  // Get token details
  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);

  // Debounced value to avoid tracking the amount while the user is typing
  const debouncedFromAmount = useDebouncedValue(fromAmount, 1000);

  // Track amount changes after user interaction
  useEffect(() => {
    if (!fromAmountFieldTouched || debouncedFromAmount !== fromAmount) return;

    trackEvent({
      event: 'amount_type',
      input_amount: debouncedFromAmount ? debouncedFromAmount.toString() : '0',
    });
  }, [fromAmountFieldTouched, debouncedFromAmount, fromAmount, trackEvent]);

  // Handle input change
  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    trackPrice.current = true;
  }, [trackPrice]);

  // Handle balance click
  const handleBalanceClick = useCallback((amount: string) => form.setValue('fromAmount', amount), [form]);

  // Withdraw numeric input component
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

  // Receive numeric input component
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

  // Handle compare fees click
  const handleCompareFeesClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      setTimeout(() => {
        feeComparisonRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
      trackPrice.current = true;

      // Track event
      trackEvent({
        event: 'compare_quote',
      });
    },
    [feeComparisonRef, trackPrice, trackEvent],
  );

  // Handle confirm button click
  const handleConfirm = useCallback(() => {
    if (!termsAccepted && !termsChecked) {
      setTermsError(true);
      setTermsAnimationKey((prev) => prev + 1);
      return;
    }

    onSwapConfirm();
  }, [onSwapConfirm, setTermsError, termsAccepted, termsChecked]);

  // Determine button state
  const getButtonState = (): SwapButtonState => {
    if (isOfframpSummaryDialogVisible) {
      return SwapButtonState.PROCESSING;
    }
    return SwapButtonState.CONFIRM;
  };

  // Determine if submit button is disabled
  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !toAmount || !!initializeFailedMessage;

  // Determine if submit button is pending
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
        <FeeCollapse
          fromAmount={fromAmount?.toString()}
          toAmount={toAmount}
          toToken={toToken}
          exchangeRate={
            <ExchangeRate exchangeRate={exchangeRate} fromToken={fromToken} toTokenSymbol={toToken.fiat.symbol} />
          }
        />
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
          <TermsAndConditions
            key={termsAnimationKey}
            toggleTermsChecked={toggleTermsChecked}
            termsChecked={termsChecked}
            termsAccepted={termsAccepted}
            termsError={termsError}
            setTermsError={setTermsError}
          />
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