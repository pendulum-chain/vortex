import React, { RefObject, useCallback, useEffect, useMemo, useState } from 'react';
import { motion } from 'motion/react';
import { FeeComparisonRef } from '../FeeComparison';
import { performSwapInitialChecks } from '../../pages/swap/helpers/swapConfirm/performSwapInitialChecks';
import { useSubmitOfframp } from '../../hooks/offramp/useSubmitOfframp';
import {
  useOfframpActions,
  useOfframpExecutionInput,
  useOfframpInitiating,
  useOfframpStarted,
  useOfframpState,
} from '../../stores/offrampStore';
import { LabeledInput } from '../LabeledInput';
import { FeeCollapse } from '../FeeCollapse';
import { BrlaInput } from '../PIXKYCForm/input';
import { SwapFormValues } from '../Nabla/schema';
import { UseFormReturn } from 'react-hook-form';
import { AssetNumericInput } from '../AssetNumericInput';
import {
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  InputTokenType,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { useNetwork } from '../../contexts/network';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';
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

interface SwapProps {
  form: UseFormReturn<SwapFormValues, any, undefined>;
  from: InputTokenType;
  to: OutputTokenType;
  tokenOutAmount: UseTokenOutAmountResult;
  fromAmount: Big.Big | undefined;
  feeComparisonRef: RefObject<FeeComparisonRef | null>;
  inputAmountIsStable: boolean;
  trackQuote: React.RefObject<boolean>;
  apiInitializeFailed: boolean;
  initializeFailedMessage: string | null;
  isOfframpSummaryDialogVisible: boolean;
  openTokenSelectModal: (token: 'from' | 'to') => void;
  onSwapConfirm: (data: SwapFormValues) => void;
  getCurrentErrorMessage: () => string | null | undefined;
}

export const Swap = ({
  form,
  from,
  to,
  tokenOutAmount,
  fromAmount,
  feeComparisonRef,
  inputAmountIsStable,
  trackQuote,
  apiInitializeFailed,
  initializeFailedMessage,
  isOfframpSummaryDialogVisible,
  getCurrentErrorMessage,
  onSwapConfirm,
  openTokenSelectModal,
}: SwapProps) => {
  const { selectedNetwork } = useNetwork();
  const { trackEvent } = useEventsContext();

  const fromToken = getInputTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getOutputTokenDetails(to);

  const { setTermsAccepted, toggleTermsChecked, termsChecked, termsAccepted, termsError, setTermsError } =
    useTermsAndConditions();

  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const offrampInitiating = useOfframpInitiating();

  const cachedAnchorUrl = useSep24StoreCachedAnchorUrl();

  const [fromAmountFieldTouched, setFromAmountFieldTouched] = useState(false);
  const [termsAnimationKey, setTermsAnimationKey] = useState(0);

  // We need to keep track of the amount the user has entered. We use a debounced value to avoid tracking the amount while the user is typing.
  const debouncedFromAmount = useDebouncedValue(fromAmount, 1000);

  useEffect(() => {
    if (fromAmountFieldTouched) {
      // We need this check to avoid tracking the amount for the default value of fromAmount.
      if (debouncedFromAmount !== fromAmount) return;

      trackEvent({
        event: 'amount_type',
        input_amount: debouncedFromAmount ? debouncedFromAmount.toString() : '0',
      });
    }
  }, [fromAmountFieldTouched, debouncedFromAmount, fromAmount, trackEvent]);

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('fromAmount')}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.networkAssetIcon}
          onClick={() => openTokenSelectModal('from')}
          onChange={() => {
            // User interacted with the input field
            setFromAmountFieldTouched(true);
            // This also enables the quote tracking events
            trackQuote.current = true;
          }}
          id="fromAmount"
        />
        <UserBalance token={fromToken} onClick={(amount: string) => form.setValue('fromAmount', amount)} />
      </>
    ),
    [form, fromToken, openTokenSelectModal],
  );

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => openTokenSelectModal('to')}
        registerInput={form.register('toAmount')}
        disabled={tokenOutAmount.isLoading}
        readOnly={true}
        id="toAmount"
      />
    ),
    [toToken.fiat.assetIcon, toToken.fiat.symbol, form, tokenOutAmount.isLoading, openTokenSelectModal],
  );

  const onConfirm = useCallback(() => {
    if (!termsAccepted && !termsChecked) {
      setTermsError(true);

      // We need to trigger a re-render of the TermsAndConditions component to animate
      setTermsAnimationKey((prev) => prev + 1);
      return;
    }

    onSwapConfirm(form.getValues());
  }, [form, onSwapConfirm]);

  return (
    <motion.form
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
      onSubmit={form.handleSubmit(onSwapConfirm)}
    >
      <h1 className="mt-2 mb-5 text-3xl font-bold text-center text-blue-700">Sell Crypto</h1>
      <LabeledInput label="You sell" htmlFor="fromAmount" Input={WithdrawNumericInput} />
      <div className="my-10" />
      <LabeledInput label="You receive" htmlFor="toAmount" Input={ReceiveNumericInput} />
      <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
      <BrlaInput form={form} toToken={to}></BrlaInput>
      <FeeCollapse
        fromAmount={fromAmount?.toString()}
        toAmount={tokenOutAmount.data?.roundedDownQuotedAmountOut}
        toToken={toToken}
        exchangeRate={
          <ExchangeRate
            {...{
              exchangeRate: tokenOutAmount.data?.effectiveExchangeRate,
              fromToken,
              toTokenSymbol: toToken.fiat.symbol,
            }}
          />
        }
      />
      <section className="flex items-center justify-center w-full mt-5">
        <BenefitsList amount={fromAmount} currency={from} />
      </section>
      <section className="flex justify-center w-full mt-5">
        {(initializeFailedMessage || apiInitializeFailed) && (
          <div className="flex items-center gap-4">
            <p className="text-red-600">{initializeFailedMessage}</p>
          </div>
        )}
      </section>
      <section className="w-full mt-5">
        <TermsAndConditions
          key={termsAnimationKey}
          {...{ toggleTermsChecked, termsChecked, termsAccepted, termsError, setTermsError }}
          setTermsAccepted={setTermsAccepted}
        />
      </section>
      <div className="flex gap-3 mt-5">
        <button
          className="btn-vortex-primary-inverse btn"
          style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
          disabled={!inputAmountIsStable}
          onClick={(e) => {
            e.preventDefault();
            // Scroll to the comparison fees section (with a small delay to allow the component to render first)
            setTimeout(() => {
              feeComparisonRef.current?.scrollIntoView();
            }, 200);
            // We track the user interaction with the button, for tracking the quote requested.
            trackQuote.current = true;
          }}
        >
          Compare fees
        </button>
        <SwapSubmitButton
          text={
            offrampInitiating
              ? 'Confirming'
              : offrampStarted && isOfframpSummaryDialogVisible
              ? 'Processing'
              : 'Confirm'
          }
          disabled={Boolean(getCurrentErrorMessage()) || !inputAmountIsStable || !!initializeFailedMessage}
          pending={
            offrampInitiating ||
            (offrampStarted && Boolean(cachedAnchorUrl) && isOfframpSummaryDialogVisible) ||
            offrampState !== undefined
          }
        />
      </div>
      <div className="mb-16" />
      <PoweredBy />
    </motion.form>
  );
};
