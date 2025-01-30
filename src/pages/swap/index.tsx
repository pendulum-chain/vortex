import Big from 'big.js';
import { useEffect, useMemo, useRef, useState, useCallback } from 'preact/hooks';
import { ApiPromise } from '@polkadot/api';
import { Fragment } from 'preact';
import { motion } from 'framer-motion';

import { calculateTotalReceive, FeeCollapse } from '../../components/FeeCollapse';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { SwapSubmitButton } from '../../components/buttons/SwapSubmitButton';
import { TermsAndConditions } from '../../components/TermsAndConditions';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { FeeComparison, FeeComparisonRef } from '../../components/FeeComparison';
import { BenefitsList } from '../../components/BenefitsList';
import { ExchangeRate } from '../../components/ExchangeRate';
import { LabeledInput } from '../../components/LabeledInput';
import { UserBalance } from '../../components/UserBalance';
import { SigningBox } from '../../components/SigningBox';
import { PoweredBy } from '../../components/PoweredBy';

import { PitchSection } from '../../sections/Pitch';
import { TrustedBy } from '../../components/TrustedBy';
import { WhyVortex } from '../../components/WhyVortex';

import {
  getInputTokenDetailsOrDefault,
  INPUT_TOKEN_CONFIG,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { config } from '../../config';

import { useEventsContext, clearPersistentErrorEventStore } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { usePendulumNode } from '../../contexts/polkadotNode';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { showToast, ToastMessage } from '../../helpers/notifications';
import { isNetworkEVM } from '../../helpers/networks';

import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { useMainProcess } from '../../hooks/offramp/useMainProcess';
import { useSwapUrlParams } from './useSwapUrlParams';

import { BaseLayout } from '../../layouts';
import { ProgressPage } from '../progress';
import { FailurePage } from '../failure';
import { SuccessPage } from '../success';
import {
  useOfframpActions,
  useOfframpSigningPhase,
  useOfframpState,
  useOfframpStarted,
  useOfframpInitiating,
} from '../../stores/offrampStore';
import { useVortexAccount } from '../../hooks/useVortexAccount';
import { useTermsAndConditions } from '../../hooks/useTermsAndConditions';
import { swapConfirm } from './helpers/swapConfirm';
import { usePolkadotWalletState } from '../../contexts/polkadotWallet';
import { Banner } from '../../components/Banner';
import {
  MoonbeamFundingAccountError,
  PendulumFundingAccountError,
  StellarFundingAccountError,
  useSigningService,
} from '../../services/signingService';
import { OfframpSummaryDialog } from '../../components/OfframpSummaryDialog';

import satoshipayLogo from '../../assets/logo/satoshipay.svg';
import { FAQAccordion } from '../../sections/FAQAccordion';

export const SwapPage = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const feeComparisonRef = useRef<FeeComparisonRef>(null);
  const pendulumNode = usePendulumNode();
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { isDisconnected, address } = useVortexAccount();
  const [initializeFailedMessage, setInitializeFailedMessage] = useState<string | null>(null);
  const [apiInitializeFailed, setApiInitializeFailed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showCompareFees, setShowCompareFees] = useState(false);
  const [isOfframpSummaryDialogVisible, setIsOfframpSummaryDialogVisible] = useState(false);
  const [cachedAnchorUrl, setCachedAnchorUrl] = useState<string | undefined>(undefined);
  const [cachedId, setCachedId] = useState<string | undefined>(undefined);
  const { trackEvent } = useEventsContext();
  const { selectedNetwork, setNetworkSelectorDisabled } = useNetwork();
  const { walletAccount } = usePolkadotWalletState();

  const [termsAnimationKey, setTermsAnimationKey] = useState(0);
  const {
    error: signingServiceError,
    isLoading: isSigningServiceLoading,
    isError: isSigningServiceError,
  } = useSigningService();

  const { setTermsAccepted, toggleTermsChecked, termsChecked, termsAccepted, termsError, setTermsError } =
    useTermsAndConditions();

  useEffect(() => {
    if (!pendulumNode.apiComponents?.api && pendulumNode?.isFetched) {
      setApiInitializeFailed(true);
      trackEvent({ event: 'initialization_error', error_message: 'node_connection_issue' });
    }
    if (pendulumNode.apiComponents?.api) {
      setApi(pendulumNode.apiComponents.api);
    }
  }, [pendulumNode, trackEvent, setApiInitializeFailed]);

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
      setInitializeFailed();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSigningServiceLoading, isSigningServiceError, signingServiceError, trackEvent]);

  useEffect(() => {
    if (api && !isSigningServiceError && !isSigningServiceLoading) {
      setIsReady(true);
      clearPersistentErrorEventStore();
    }
  }, [api, isSigningServiceError, isSigningServiceLoading]);

  // Maybe go into a state of UI errors??
  const setInitializeFailed = useCallback((message?: string | null) => {
    setInitializeFailedMessage(
      message ??
        "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!",
    );
  }, []);

  // Main process hook
  const {
    handleOnSubmit,
    finishOfframping,
    continueFailedFlow,
    firstSep24ResponseState,
    handleOnAnchorWindowOpen,
    maybeCancelSep24First,
  } = useMainProcess();

  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const offrampSigningPhase = useOfframpSigningPhase();
  const offrampInitiating = useOfframpInitiating();
  const { setOfframpInitiating } = useOfframpActions();

  // Store the id as it is cleared after the user opens the anchor window
  useEffect(() => {
    if (firstSep24ResponseState?.id != undefined) {
      setCachedId(firstSep24ResponseState?.id);
    }
  }, [firstSep24ResponseState?.id]);

  // Store the anchor URL when it becomes available
  useEffect(() => {
    if (firstSep24ResponseState?.url) {
      setCachedAnchorUrl(firstSep24ResponseState.url);
      setIsOfframpSummaryDialogVisible(true);
    }
  }, [firstSep24ResponseState?.url]);

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
  } = useSwapForm();

  useSwapUrlParams({ form, setShowCompareFees });

  const fromToken = getInputTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = OUTPUT_TOKEN_CONFIG[to];
  const formToAmount = form.watch('toAmount');
  // The price comparison is only available for Polygon (for now)
  const vortexPrice = useMemo(() => (formToAmount ? Big(formToAmount) : Big(0)), [formToAmount]);

  const userInputTokenBalance = useInputTokenBalance({ fromToken });

  const tokenOutAmount = useTokenOutAmount({
    wantsSwap: true,
    api,
    inputTokenType: from,
    outputTokenType: to,
    maximumFromAmount: undefined,
    fromAmountString,
    form,
    network: selectedNetwork,
  });

  const inputAmountIsStable =
    tokenOutAmount.stableAmountInUnits !== undefined &&
    tokenOutAmount.stableAmountInUnits != '' &&
    Big(tokenOutAmount.stableAmountInUnits).gt(Big(0));

  useEffect(() => {
    if (tokenOutAmount.data) {
      const toAmount = tokenOutAmount.data.roundedDownQuotedAmountOut;
      // Calculate the final amount after the offramp fees
      const totalReceive = calculateTotalReceive(toAmount, toToken);
      form.setValue('toAmount', totalReceive);
    } else if (!tokenOutAmount.isLoading || tokenOutAmount.error) {
      form.setValue('toAmount', '0');
    } else {
      // Do nothing
    }
  }, [form, tokenOutAmount.data, tokenOutAmount.error, tokenOutAmount.isLoading, toToken]);

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

        setIsOfframpSummaryDialogVisible(false);
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

  useEffect(() => {
    const isNetworkSelectorDisabled = offrampState?.phase !== undefined;
    setNetworkSelectorDisabled(isNetworkSelectorDisabled);
  }, [offrampState, setNetworkSelectorDisabled]);

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
            trackEvent({ event: 'amount_type' });
          }}
          id="fromAmount"
        />
        <UserBalance token={fromToken} onClick={(amount: string) => form.setValue('fromAmount', amount)} />
      </>
    ),
    [form, fromToken, openTokenSelectModal, trackEvent],
  );

  function getCurrentErrorMessage() {
    if (isDisconnected) return;

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0) && walletAccount) {
        trackEvent({ event: 'form_error', error_message: 'insufficient_balance' });
        return `Insufficient balance. Your balance is ${userInputTokenBalance} ${fromToken?.assetSymbol}.`;
      }
    }

    const amountOut = tokenOutAmount.data?.roundedDownQuotedAmountOut;

    if (amountOut !== undefined) {
      const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxWithdrawalAmountRaw), -toToken.decimals);
      const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minWithdrawalAmountRaw), -toToken.decimals);

      if (maxAmountUnits.lt(amountOut)) {
        trackEvent({ event: 'form_error', error_message: 'more_than_maximum_withdrawal' });
        return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }

      if (!config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut)) {
        trackEvent({ event: 'form_error', error_message: 'less_than_minimum_withdrawal' });
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }
    }

    return tokenOutAmount.error;
  }

  const definitions =
    tokenSelectModalType === 'from'
      ? Object.entries(INPUT_TOKEN_CONFIG[selectedNetwork]).map(([key, value]) => ({
          type: key as InputTokenType,
          assetSymbol: value.assetSymbol,
          assetIcon: value.networkAssetIcon,
        }))
      : Object.entries(OUTPUT_TOKEN_CONFIG).map(([key, value]) => ({
          type: key as OutputTokenType,
          assetSymbol: value.fiat.symbol,
          assetIcon: value.fiat.assetIcon,
          name: value.fiat.name,
        }));

  const modals = (
    <>
      <PoolSelectorModal
        open={isTokenSelectModalVisible}
        onSelect={(token) => {
          tokenSelectModalType === 'from' ? onFromChange(token) : onToChange(token);
          maybeCancelSep24First();
        }}
        definitions={definitions}
        selected={tokenSelectModalType === 'from' ? from : to}
        onClose={() => closeTokenSelectModal()}
        isLoading={false}
      />
    </>
  );

  if (offrampState?.phase === 'success') {
    return <SuccessPage finishOfframping={finishOfframping} transactionId={cachedId} toToken={to} />;
  }

  if (offrampState?.failure !== undefined) {
    return (
      <FailurePage
        finishOfframping={finishOfframping}
        continueFailedFlow={continueFailedFlow}
        transactionId={cachedId}
        failure={offrampState.failure}
      />
    );
  }

  if (offrampState !== undefined || offrampStarted) {
    const isAssetHubFlow =
      !isNetworkEVM(selectedNetwork) &&
      (offrampState?.phase === 'pendulumFundEphemeral' || offrampState?.phase === 'executeAssetHubXCM');
    const showMainScreenAnyway =
      offrampState === undefined ||
      ['prepareTransactions', 'squidRouter'].includes(offrampState.phase) ||
      isAssetHubFlow;
    if (!showMainScreenAnyway) {
      return <ProgressPage offrampingState={offrampState} />;
    }
  }

  const onSwapConfirm = (e: Event) => {
    e.preventDefault();

    if (offrampStarted) {
      setIsOfframpSummaryDialogVisible(true);
      return;
    }

    if (!termsAccepted && !termsChecked) {
      setTermsError(true);

      // We need to trigger a re-render of the TermsAndConditions component to animate
      setTermsAnimationKey((prev) => prev + 1);
      return;
    }

    swapConfirm(e, {
      inputAmountIsStable,
      address,
      fromAmount,
      tokenOutAmount,
      api,
      to,
      from,
      selectedNetwork,
      fromAmountString,
      requiresSquidRouter: isNetworkEVM(selectedNetwork),
      setOfframpInitiating,
      setInitializeFailed,
      handleOnSubmit,
      setTermsAccepted,
    });

    setIsOfframpSummaryDialogVisible(true);
  };

  const main = (
    <main ref={formRef}>
      <OfframpSummaryDialog
        fromToken={fromToken}
        fromAmountString={fromAmountString}
        toToken={toToken}
        formToAmount={formToAmount}
        tokenOutAmount={tokenOutAmount}
        visible={isOfframpSummaryDialogVisible}
        anchorUrl={firstSep24ResponseState?.url || cachedAnchorUrl}
        onSubmit={() => {
          handleOnAnchorWindowOpen();
        }}
        onClose={() => setIsOfframpSummaryDialogVisible(false)}
      />
      <SigningBox step={offrampSigningPhase} />
      <motion.form
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.3 }}
        className="px-4 pt-4 pb-2 mx-4 mt-8 mb-4 rounded-lg shadow-custom md:mx-auto md:w-96"
        onSubmit={onSwapConfirm}
      >
        <h1 className="mt-2 mb-5 text-3xl font-bold text-center text-blue-700">Sell Crypto</h1>
        <LabeledInput label="You sell" htmlFor="fromAmount" Input={WithdrawNumericInput} />
        <div className="my-10" />
        <LabeledInput label="You receive" htmlFor="toAmount" Input={ReceiveNumericInput} />
        <p className="mb-6 text-red-600">{getCurrentErrorMessage()}</p>
        <FeeCollapse
          fromAmount={fromAmount?.toString()}
          toAmount={tokenOutAmount.data?.roundedDownQuotedAmountOut}
          toToken={toToken}
          exchangeRate={
            <ExchangeRate
              {...{
                tokenOutData: tokenOutAmount,
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
          />
        </section>
        <div className="flex gap-3 mt-5">
          <button
            className="btn-vortex-primary-inverse btn"
            style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
            disabled={!inputAmountIsStable}
            onClick={(e) => {
              e.preventDefault();
              // We always show the fees comparison when the user clicks on the button. It will not be hidden again.
              if (!showCompareFees) setShowCompareFees(true);
              // Scroll to the comparison fees section (with a small delay to allow the component to render first)
              setTimeout(() => {
                feeComparisonRef.current?.scrollIntoView();
              }, 200);
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
      <p className="flex items-center justify-center mr-1 text-gray-500">
        <a
          href="https://satoshipay.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm transition hover:opacity-80"
        >
          A <img src={satoshipayLogo} alt="Satoshipay" className="h-4" /> Company
        </a>
      </p>
      {showCompareFees && fromToken && fromAmount && toToken && (
        <FeeComparison
          sourceAssetSymbol={fromToken.assetSymbol}
          amount={fromAmount}
          targetAssetSymbol={toToken.fiat.symbol}
          vortexPrice={vortexPrice}
          network={selectedNetwork}
          ref={feeComparisonRef}
        />
      )}
      <PitchSection />
      <TrustedBy />
      <WhyVortex />
      <FAQAccordion />
      <Banner />
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
