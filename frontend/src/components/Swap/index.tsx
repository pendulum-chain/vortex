import React, { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';

import { LabeledInput } from '../LabeledInput';
import { FeeCollapse } from '../FeeCollapse';
import { BrlaSwapFields } from '../BrlaComponents/BrlaSwapFields';
import { SwapFormValues } from '../Nabla/schema';
import { FormProvider, UseFormReturn } from 'react-hook-form';
import { AssetNumericInput } from '../AssetNumericInput';
import { getOnChainTokenDetailsOrDefault, getAnyFiatTokenDetails, OnChainToken, FiatToken } from 'shared';
import { useNetwork } from '../../contexts/network';
import { TermsAndConditions } from '../TermsAndConditions';
import { SwapSubmitButton } from '../buttons/SwapSubmitButton';
import { PoweredBy } from '../PoweredBy';
import { UserBalance } from '../UserBalance';
import { useTermsAndConditions } from '../../hooks/useTermsAndConditions';
import { ExchangeRate } from '../ExchangeRate';
import { BenefitsList } from '../BenefitsList';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { useDebouncedValue } from '../../hooks/useDebouncedValue';
import { useEventsContext } from '../../contexts/events';

enum SwapButtonState {
  CONFIRMING = 'Confirming',
  PROCESSING = 'Processing',
  CONFIRM = 'Confirm',
}

enum TokenSelectType {
  FROM = 'from',
  TO = 'to',
}

interface SwapProps {
  form: UseFormReturn<SwapFormValues, unknown, undefined>;
  from: OnChainToken;
  to: FiatToken;
  fromAmount: Big.Big | undefined;
  toAmount: Big.Big | undefined;
  exchangeRate: number;
  feeComparisonRef: RefObject<HTMLDivElement | null>;
  trackPrice: React.RefObject<boolean>;
  apiInitializeFailed: boolean;
  initializeFailedMessage: string | null;
  isOfframpSummaryDialogVisible: boolean;
  openTokenSelectModal: (token: TokenSelectType) => void;
  onSwapConfirm: () => void;
  getCurrentErrorMessage: () => string | null | undefined;
}

export const Swap = ({
  form,
  from,
  to,
  fromAmount,
  toAmount,
  exchangeRate,
  feeComparisonRef,
  trackPrice,
  apiInitializeFailed,
  initializeFailedMessage,
  isOfframpSummaryDialogVisible,
  getCurrentErrorMessage,
  onSwapConfirm,
  openTokenSelectModal,
}: SwapProps) => {
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();
  const cachedAnchorUrl = useSep24StoreCachedAnchorUrl();

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);

  const { toggleTermsChecked, termsChecked, termsAccepted, termsError, setTermsError } = useTermsAndConditions();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);
  const [termsAnimationKey, setTermsAnimationKey] = useState(0);

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

  const handleInputChange = useCallback(() => {
    setFromAmountFieldTouched(true);
    trackPrice.current = true;
  }, [trackPrice]);

  const handleBalanceClick = useCallback((amount: string) => form.setValue('fromAmount', amount), [form]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('fromAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal(TokenSelectType.FROM)}
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
        onClick={() => openTokenSelectModal(TokenSelectType.TO)}
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
        feeComparisonRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 200);
      trackPrice.current = true;
    },
    [feeComparisonRef, trackPrice],
  );

  const onConfirm = useCallback(() => {
    if (!termsAccepted && !termsChecked) {
      setTermsError(true);
      setTermsAnimationKey((prev) => prev + 1);
      return;
    }

    onSwapConfirm();
  }, [onSwapConfirm, setTermsError, termsAccepted, termsChecked]);

  const getButtonState = (): SwapButtonState => {
    if (isOfframpSummaryDialogVisible) {
      return SwapButtonState.PROCESSING;
    }
    return SwapButtonState.CONFIRM;
  };

  const isSubmitButtonDisabled = Boolean(getCurrentErrorMessage()) || !toAmount || !!initializeFailedMessage;

  const isSubmitButtonPending = isOfframpSummaryDialogVisible;

  const displayInitializeFailedMessage = initializeFailedMessage;
  return (
    <FormProvider {...form}>
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
        onSubmit={form.handleSubmit(onConfirm)}
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
        {(initializeFailedMessage || apiInitializeFailed) && (
          <section className="flex justify-center w-full mt-5">
            <div className="flex items-center gap-4">
              <p className="text-red-600">{displayInitializeFailedMessage}</p>
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
