import Big from 'big.js';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { PoolSelectorModal, TokenDefinition } from '../../components/InputKeys/SelectionModal';
import { useSwapForm } from '../../components/Nabla/useSwapForm';

import { FeeComparison } from '../../components/FeeComparison';
import { SigningBox } from '../../components/SigningBox';

import { PitchSection } from '../../sections/Pitch';
import { TrustedBy } from '../../sections/TrustedBy';
import { WhyVortex } from '../../sections/WhyVortex';

import {
  AssetHubToken,
  assetHubTokenConfig,
  DestinationType,
  evmTokenConfig,
  FiatToken,
  getAnyFiatTokenDetails,
  getEnumKeyByStringValue,
  getOnChainTokenDetailsOrDefault,
  moonbeamTokenConfig,
  Networks,
  OnChainToken,
  QuoteEndpoints,
  RampEndpoints,
  stellarTokenConfig,
} from 'shared';
import { config } from '../../config';

import { useEventsContext } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { usePendulumNode } from '../../contexts/polkadotNode';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { showToast, ToastMessage } from '../../helpers/notifications';
import { isNetworkEVM } from 'shared';

import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useMainProcess } from '../../hooks/offramp/useMainProcess';
import {
  useRampActions,
  useRampExecutionInput,
  useRampInitiating,
  useRampKycStarted,
  useRampSigningPhase,
  useRampStarted,
  useRampState,
  useRampSummaryVisible,
} from '../../stores/offrampStore';
import { RampExecutionInput, RampState } from '../../types/phases';
import { useSwapUrlParams } from '../../hooks/useRampUrlParams';

import { BaseLayout } from '../../layouts';
import { ProgressPage } from '../progress';
import { FailurePage } from '../failure';
import { SuccessPage } from '../success';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import { GotQuestions } from '../../sections/GotQuestions';
import {
  MoonbeamFundingAccountError,
  PendulumFundingAccountError,
  StellarFundingAccountError,
  useSigningService,
} from '../../services/signingService';
import { OfframpSummaryDialog } from '../../components/OfframpSummaryDialog';

import satoshipayLogo from '../../assets/logo/satoshipay.svg';
import { FAQAccordion } from '../../sections/FAQAccordion';
import { HowToSell } from '../../sections/HowToSell';
import { PopularTokens } from '../../sections/PopularTokens';
import { PIXKYCForm } from '../../components/BrlaComponents/BrlaExtendedForm';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { Swap } from '../../components/Swap';
import { QuoteService } from '../../services/api';
import {
  createMoonbeamEphemeral,
  createPendulumEphemeral,
  createStellarEphemeral,
} from '../../services/transactions/ephemerals';

export const RampForm = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const feeComparisonRef = useRef<HTMLDivElement | null>(null);
  const trackPrice = useRef(false);
  const { isDisconnected, address } = useVortexAccount();
  const [initializeFailedMessage, setInitializeFailedMessage] = useState<string | null>(null);
  const [cachedId, setCachedId] = useState<string | undefined>(undefined);

  const { trackEvent } = useEventsContext();
  const { selectedNetwork, setNetworkSelectorDisabled } = useNetwork();

  const {
    error: signingServiceError,
    isLoading: isSigningServiceLoading,
    isError: isSigningServiceError,
  } = useSigningService();

  // TODO Replace with initializeFailed from offrampActions.
  const setInitializeFailed = useCallback((message?: string | null) => {
    setInitializeFailedMessage(
      message ??
        "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!",
    );
  }, []);
  useEffect(() => {
    if (isSigningServiceError && !isSigningServiceLoading) {
      if (signingServiceError instanceof StellarFundingAccountError) {
        trackEvent({ event: 'initialization_error', error_message: 'stellar_account_issue' });
      } else if (signingServiceError instanceof PendulumFundingAccountError) {
        trackEvent({ event: 'initialization_error', error_message: 'pendulum_account_issue' });
      } else if (signingServiceError instanceof MoonbeamFundingAccountError) {
        trackEvent({ event: 'initialization_error', error_message: 'moonbeam_account_issue' });
      } else {
        trackEvent({ event: 'initialization_error', error_message: 'signer_service_issue' });
      }
      console.log('signingServiceError', signingServiceError);
      setInitializeFailed();
    }
  }, [isSigningServiceLoading, isSigningServiceError, signingServiceError, setInitializeFailed, trackEvent]);

  const {
    isTokenSelectModalVisible,
    tokenSelectModalType,
    openTokenSelectModal,
    closeTokenSelectModal,
    onFromChange,
    onToChange,
    form,
    fromAmount,
    fromAmountString,
    from,
    to,
    taxId,
    pixId,
  } = useSwapForm();

  // Ramp state from store
  const rampState = useRampState();
  const rampInitiating = useRampInitiating();
  const rampStarted = useRampStarted();
  const isOfframpSummaryDialogVisible = useRampSummaryVisible();
  const { setRampExecutionInput, setRampInitiating, setRampSummaryVisible } = useRampActions();

  // Quote state
  const [quoteLoading, setQuoteLoading] = useState(false);
  const [quoteError, setQuoteError] = useState<string | null>(null);
  const [quote, setQuote] = useState<QuoteEndpoints.QuoteResponse | undefined>(undefined);

  // Main process hook
  const {
    handleOnSubmit,
    finishOfframping,
    continueFailedFlow,
    firstSep24ResponseState,
    handleOnAnchorWindowOpen,
    maybeCancelSep24First,
    handleBrlaOfframpStart,
  } = useMainProcess();

  const cachedAnchorUrl = useSep24StoreCachedAnchorUrl();

  // Fetch quote from backend
  const fetchQuote = useCallback(async () => {
    if (!fromAmount || !address) return;

    setQuoteLoading(true);
    setQuoteError(null);

    try {
      // Convert network to chain ID
      const rampType = 'off';
      const fromDestination: DestinationType = selectedNetwork;
      const toDestination: DestinationType = to === FiatToken.BRL ? 'pix' : to === FiatToken.ARS ? 'cbu' : 'sepa';
      const inputAmount = fromAmount.toString();

      const quoteResponse = await QuoteService.createQuote(
        rampType,
        fromDestination,
        toDestination,
        inputAmount,
        from,
        to,
      );
      setQuote(quoteResponse);

      // Update toAmount based on quote
      const toAmount = Big(quoteResponse.outputAmount);
      form.setValue('toAmount', toAmount.toFixed(2));

      // Track event
      trackEvent({
        event: 'transaction_confirmation',
        from_asset: from,
        to_asset: to,
        from_amount: fromAmount.toString(),
        to_amount: quoteResponse.outputAmount,
      });
    } catch (error) {
      console.error('Error fetching quote:', error);
      setQuoteError(error instanceof Error ? error.message : 'Failed to get quote');
      trackEvent({
        event: 'initialization_error',
        error_message: 'signer_service_issue',
      });
    } finally {
      setQuoteLoading(false);
    }
  }, [fromAmount, address, selectedNetwork, to, from, form, trackEvent]);

  // Fetch quote when amount changes
  useEffect(() => {
    if (!fromAmount || !address) return;

    fetchQuote();
  }, [fromAmount, address, fetchQuote]);

  // Store the id as it is cleared after the user opens the anchor window
  useEffect(() => {
    if (firstSep24ResponseState?.id != undefined) {
      setCachedId(firstSep24ResponseState?.id);
    }
  }, [firstSep24ResponseState?.id]);

  useSwapUrlParams({ form, feeComparisonRef });

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);
  const formToAmount = form.watch('toAmount');
  const toAmount = quote ? Big(quote.outputAmount) : undefined;
  // The price comparison is only available for Polygon (for now)
  const vortexPrice = useMemo(() => (formToAmount ? Big(formToAmount) : Big(0)), [formToAmount]);

  const userInputTokenBalance = useInputTokenBalance({ fromToken });

  const executionInput = useRampExecutionInput();
  const offrampKycStarted = useRampKycStarted();
  const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

  // We create one listener to listen for the anchor callback, on initialize.
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.origin != 'https://circle.anchor.mykobo.co') {
        return;
      }

      // See: https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0024.md
      // status: pending_user_transfer_start indicates the anchor is ready to receive funds
      if (event.data.transaction.status === 'pending_user_transfer_start') {
        console.log('Callback received from external site, anchor flow completed.');

        // We don't automatically close the window, as this could be confusing for the user.
        // event.source.close();
        showToast(ToastMessage.KYC_COMPLETED);
      }
    };

    // Add the message listener
    window.addEventListener('message', handleMessage);

    // Cleanup
    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, []);

  function getCurrentErrorMessage() {
    if (isDisconnected) return 'Please connect your wallet';

    if (quoteError) return quoteError;

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0)) {
        trackEvent({
          event: 'form_error',
          error_message: 'insufficient_balance',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });
        return `Insufficient balance. Your balance is ${userInputTokenBalance} ${fromToken?.assetSymbol}.`;
      }
    }

    const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxWithdrawalAmountRaw), -toToken.decimals);
    const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minWithdrawalAmountRaw), -toToken.decimals);

    // Use exchange rate from quote if available
    const exchangeRate = quote ? Number(quote.outputAmount) / Number(quote.inputAmount) : 0;

    if (fromAmount && exchangeRate && maxAmountUnits.lt(fromAmount.mul(exchangeRate))) {
      trackEvent({
        event: 'form_error',
        error_message: 'more_than_maximum_withdrawal',
        input_amount: fromAmount ? fromAmount.toString() : '0',
      });
      return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
        toToken.fiat.symbol
      }.`;
    }

    // Use amount from quote if available
    const amountOut = quote ? Big(quote.outputAmount) : Big(0);

    if (!amountOut.eq(0)) {
      if (!config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut)) {
        trackEvent({
          event: 'form_error',
          error_message: 'less_than_minimum_withdrawal',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }
    }

    if (quoteLoading) return 'Calculating quote...';

    return null;
  }

  const handleOfframpSubmit = useCallback(() => {
    if (!address) {
      setInitializeFailed('No address found');
      return;
    }

    to === 'brl' ? handleBrlaOfframpStart() : handleOnAnchorWindowOpen();
  }, [address, to, handleBrlaOfframpStart, handleOnAnchorWindowOpen, setInitializeFailed]);

  // Show success page if ramp process is complete
  if (rampState?.ramp?.currentPhase === 'complete') {
    return <SuccessPage finishOfframping={finishOfframping} transactionId={cachedId} toToken={to} />;
  }

  // Show error page if ramp process failed
  // TODO instead of using phase === 'failure', we should check the time how long the user has been waiting
  // and show the error logs if the user has been waiting for more than 30(?) minutes
  if (rampState?.ramp?.currentPhase === 'failed') {
    return (
      <FailurePage
        finishOfframping={finishOfframping}
        continueFailedFlow={continueFailedFlow}
        transactionId={cachedId}
      />
    );
  }

  // Show progress page if ramp process is in progress
  if (rampState !== undefined && rampStarted) {
    return <ProgressPage offrampingState={rampState} />;
  }

  const onSwapConfirm = async () => {
    if (!address) {
      setInitializeFailed('No address found');
      return;
    }

    if (!quote) {
      setInitializeFailed('No quote available');
      return;
    }

    if (!fromAmount) {
      setInitializeFailed('No amount specified');
      return;
    }

    try {
      // Create execution input
      const pendulumEphemeral = createPendulumEphemeral();
      const stellarEphemeral = createStellarEphemeral();
      const moonbeamEphemeral = createMoonbeamEphemeral();

      const executionInput: RampExecutionInput = {
        ephemerals: {
          pendulumEphemeral,
          stellarEphemeral,
          moonbeamEphemeral,
        },
        quote,
        onChainToken: from,
        fiatToken: to,
        userWalletAddress: address,
        network: selectedNetwork,
        taxId,
        pixId,
        setInitializeFailed,
      };

      // Store execution input in global state
      setRampExecutionInput(executionInput);

      // Show summary dialog
      setRampSummaryVisible(true);

      // TODO add back some of the checks? Maybe not necessary if backend returns error
      handleOnSubmit(executionInput);

      // Track event
      trackEvent({
        event: 'transaction_confirmation',
        from_asset: from,
        to_asset: to,
        from_amount: fromAmount.toString(),
        to_amount: quote.outputAmount,
      });
    } catch (error) {
      console.error('Error preparing swap:', error);
      setInitializeFailed(error instanceof Error ? error.message : 'Failed to prepare swap');
      setRampInitiating(false);
    }
  };

  const main = (
    <main ref={formRef}>
      <OfframpSummaryDialog
        visible={isOfframpSummaryDialogVisible}
        executionInput={executionInput}
        anchorUrl={firstSep24ResponseState?.url || cachedAnchorUrl}
        onSubmit={handleOfframpSubmit}
        onClose={() => setRampSummaryVisible(false)}
      />
      <SigningBox />
      {offrampKycStarted ? (
        <PIXKYCForm feeComparisonRef={feeComparisonRef} />
      ) : (
        <Swap
          form={form}
          from={from}
          to={to}
          fromAmount={fromAmount}
          toAmount={toAmount}
          exchangeRate={exchangeRate}
          feeComparisonRef={feeComparisonRef}
          trackPrice={trackPrice}
          isOfframpSummaryDialogVisible={isOfframpSummaryDialogVisible}
          initializeFailedMessage={initializeFailedMessage}
          getCurrentErrorMessage={getCurrentErrorMessage}
          openTokenSelectModal={openTokenSelectModal}
          onSwapConfirm={onSwapConfirm}
        />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
