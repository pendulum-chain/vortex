import Big from 'big.js';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ApiPromise } from '@polkadot/api';

import { calculateOfframpTotalReceive } from '../../components/FeeCollapse';
import { PoolSelectorModal, TokenDefinition } from '../../components/InputKeys/SelectionModal';
import { useSwapForm } from '../../components/Nabla/useSwapForm';

import { FeeComparison } from '../../components/FeeComparison';
import { SigningBox } from '../../components/SigningBox';

import { PitchSection } from '../../sections/Pitch';
import { TrustedBy } from '../../sections/TrustedBy';
import { WhyVortex } from '../../sections/WhyVortex';

import {
  getEnumKeyByStringValue,
  getOnChainTokenDetailsOrDefault,
  getAnyFiatTokenDetails,
  OnChainToken,
  FiatToken,
  ON_CHAIN_TOKEN_CONFIG,
  MOONBEAM_FIAT_TOKEN_CONFIG,
  STELLAR_FIAT_TOKEN_CONFIG,
} from '../../constants/tokenConfig';
import { config } from '../../config';

import { useEventsContext, clearPersistentErrorEventStore } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { useMoonbeamNode, usePendulumNode } from '../../contexts/polkadotNode';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { showToast, ToastMessage } from '../../helpers/notifications';
import { isNetworkEVM } from '../../helpers/networks';

import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useMainProcess } from '../../hooks/offramp/useMainProcess';
import { useSwapUrlParams } from './useSwapUrlParams';

import { BaseLayout } from '../../layouts';
import { ProgressPage } from '../progress';
import { FailurePage } from '../failure';
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

export const SwapPage = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const feeComparisonRef = useRef<HTMLDivElement | null>(null);
  const pendulumNode = usePendulumNode();
  const trackPrice = useRef(false);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { isDisconnected, address } = useVortexAccount();
  const [initializeFailedMessage, setInitializeFailedMessage] = useState<string | null>(null);
  const [apiInitializeFailed, setApiInitializeFailed] = useState(false);
  const [_, setIsReady] = useState(false);
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
      setInitializeFailed();
    }
  }, [isSigningServiceLoading, isSigningServiceError, signingServiceError, setInitializeFailed, trackEvent]);

  useEffect(() => {
    if (api && !isSigningServiceError && !isSigningServiceLoading) {
      setIsReady(true);
      clearPersistentErrorEventStore();
    }
  }, [api, isSigningServiceError, isSigningServiceLoading]);

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
  // Store the id as it is cleared after the user opens the anchor window
  useEffect(() => {
    if (firstSep24ResponseState?.id != undefined) {
      setCachedId(firstSep24ResponseState?.id);
    }
  }, [firstSep24ResponseState?.id]);

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

  useSwapUrlParams({ form, feeComparisonRef });

  const fromToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getAnyFiatTokenDetails(to);
  const formToAmount = form.watch('toAmount');
  // The price comparison is only available for Polygon (for now)
  const vortexPrice = useMemo(() => (formToAmount ? Big(formToAmount) : Big(0)), [formToAmount]);

  const userInputTokenBalance = useInputTokenBalance({ fromToken });

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
    if (isDisconnected) return;

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

    // FIXME
    const exchangeRate = 0;
    if (fromAmount && exchangeRate && maxAmountUnits.lt(fromAmount.mul(exchangeRate))) {
      console.log(exchangeRate, fromAmount.mul(exchangeRate).toNumber());
      trackEvent({
        event: 'form_error',
        error_message: 'more_than_maximum_withdrawal',
        input_amount: fromAmount ? fromAmount.toString() : '0',
      });
      return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
        toToken.fiat.symbol
      }.`;
    }

    // FIXME
    const amountOut = 0;
    if (amountOut !== undefined) {
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

    // FIXME
    // if (tokenOutAmount.error?.includes('Insufficient liquidity')) {
    //   return 'The amount is temporarily not available. Please, try with a smaller amount.';
    // }
    // return tokenOutAmount.error;
  }

  const definitions: TokenDefinition[] =
    tokenSelectModalType === 'from'
      ? Object.entries(ON_CHAIN_TOKEN_CONFIG[selectedNetwork]).map(([key, value]) => ({
          type: key as OnChainToken,
          assetSymbol: value.assetSymbol,
          assetIcon: value.networkAssetIcon,
        }))
      : [...Object.entries(MOONBEAM_FIAT_TOKEN_CONFIG), ...Object.entries(STELLAR_FIAT_TOKEN_CONFIG)].map(
          ([key, value]) => ({
            type: getEnumKeyByStringValue(FiatToken, key) as FiatToken,
            assetSymbol: value.fiat.symbol,
            assetIcon: value.fiat.assetIcon,
            name: value.fiat.name,
          }),
        );

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

  const handleOfframpSubmit = useCallback(() => {
    if (!address) {
      setInitializeFailed('No address found');
      return;
    }
    // to === 'brl'
    //   ? handleBrlaOfframpStart(executionInput, selectedNetwork, address, pendulumNode.apiComponents)
    //   : handleOnAnchorWindowOpen();
  }, [
    address,
    pendulumNode.apiComponents,
    to,
    handleBrlaOfframpStart,
    selectedNetwork,
    handleOnAnchorWindowOpen,
    setInitializeFailed,
  ]);

  // FIXME
  // if (offrampState?.phase === 'success') {
  //   return <SuccessPage finishOfframping={finishOfframping} transactionId={cachedId} toToken={to} />;
  // }

  // if (offrampState?.failure !== undefined) {
  // FIXME show error page
  if (false) {
    return (
      <FailurePage
        finishOfframping={finishOfframping}
        continueFailedFlow={continueFailedFlow}
        transactionId={cachedId}
      />
    );
  }

  // FIXME show progress page
  // if (offrampState !== undefined || offrampStarted) {
  if (false) {
    const offrampState: any = {};
    return <ProgressPage offrampingState={offrampState} />;
  }

  const onSwapConfirm = () => {
    const outputToken = getAnyFiatTokenDetails(to);
    const inputToken = getOnChainTokenDetailsOrDefault(selectedNetwork, from);

    // const { expectedRedeemAmountRaw, inputAmountRaw } = calculateSwapAmountsWithMargin(
    //   validInputs.fromAmount,
    //   validInputs.tokenOutAmountData.precisePricedAmountOut,
    //   inputToken,
    //   outputToken,
    // );
    const { expectedRedeemAmountRaw, inputAmountRaw } = { expectedRedeemAmountRaw: 0, inputAmountRaw: 0 };

    // FIXME
    const outputAmountBeforeFees = Big(0);
    const outputAmountAfterFees = calculateOfframpTotalReceive(outputAmountBeforeFees, outputToken);
    const outputAmountUnits = {
      beforeFees: outputAmountBeforeFees.toFixed(2, 0),
      afterFees: outputAmountAfterFees,
    };

    if (!address) {
      setInitializeFailed('No address found');
      return;
    }
  };
  const [isOfframpSummaryVisible, setOfframpSummaryVisible] = useState(false);
  const executionInput: any = {};
  const offrampSigningPhase = undefined;
  const offrampKycStarted = false;
  const toAmount = Big(10);
  const exchangeRate = 0.9;

  const main = (
    <main ref={formRef}>
      <OfframpSummaryDialog
        visible={isOfframpSummaryVisible}
        executionInput={executionInput}
        anchorUrl={firstSep24ResponseState?.url || cachedAnchorUrl}
        onSubmit={handleOfframpSubmit}
        onClose={() => setOfframpSummaryVisible(false)}
      />
      <SigningBox step={offrampSigningPhase} />
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
          isOfframpSummaryDialogVisible={isOfframpSummaryVisible}
          apiInitializeFailed={apiInitializeFailed}
          initializeFailedMessage={initializeFailedMessage}
          getCurrentErrorMessage={getCurrentErrorMessage}
          openTokenSelectModal={openTokenSelectModal}
          onSwapConfirm={onSwapConfirm}
        />
      )}
      <p className="flex items-center justify-center mr-1 text-gray-500">
        <a
          href="https://satoshipay.io"
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-sm transition hover:opacity-80"
        >
          Developed by <img src={satoshipayLogo} alt="Satoshipay" className="h-4" />
        </a>
      </p>
      <PitchSection />
      <TrustedBy />
      <FeeComparison
        sourceAssetSymbol={fromToken.assetSymbol}
        amount={fromAmount ?? Big(100)}
        targetAssetSymbol={toToken.fiat.symbol}
        vortexPrice={vortexPrice}
        network={selectedNetwork}
        ref={feeComparisonRef}
        trackPrice={trackPrice.current}
      />
      <WhyVortex />
      <HowToSell />
      <PopularTokens />
      <FAQAccordion />
      <GotQuestions />
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
