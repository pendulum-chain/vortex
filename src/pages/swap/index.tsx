import Big from 'big.js';
import * as Sentry from '@sentry/react';
import { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { ApiPromise } from '@polkadot/api';
import { useTranslation } from 'react-i18next';

import { calculateTotalReceive } from '../../components/FeeCollapse';
import { PoolSelectorModal, TokenDefinition } from '../../components/InputKeys/SelectionModal';
import { useSwapForm } from '../../components/Nabla/useSwapForm';

import { FeeComparison } from '../../sections/FeeComparison';
import { SigningBox } from '../../components/SigningBox';

import { PitchSection } from '../../sections/Pitch';
import { TrustedBy } from '../../sections/TrustedBy';
import { WhyVortex } from '../../sections/WhyVortex';

import {
  getEnumKeyByStringValue,
  getInputTokenDetailsOrDefault,
  getOutputTokenDetails,
  INPUT_TOKEN_CONFIG,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
  OutputTokenTypes,
} from '../../constants/tokenConfig';
import { config } from '../../config';

import { useEventsContext, clearPersistentErrorEventStore } from '../../contexts/events';
import { useNetwork } from '../../contexts/network';
import { usePendulumNode } from '../../contexts/polkadotNode';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useToastMessage } from '../../hooks/useToastMessage';
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
  useOfframpExecutionInput,
  useOfframpKycStarted,
  useOfframpSummaryVisible,
} from '../../stores/offrampStore';
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
import { calculateSwapAmountsWithMargin } from './helpers/swapConfirm/calculateSwapAmountsWithMargin';
import { validateSwapInputs } from './helpers/swapConfirm/validateSwapInputs';
import { performSwapInitialChecks } from './helpers/swapConfirm/performSwapInitialChecks';
import { useSep24StoreCachedAnchorUrl } from '../../stores/sep24Store';
import { Swap } from '../../components/Swap';

type ExchangeRateCache = Partial<Record<InputTokenType, Partial<Record<OutputTokenType, number>>>>;

export const SwapPage = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const feeComparisonRef = useRef<HTMLDivElement | null>(null);
  const pendulumNode = usePendulumNode();
  const trackQuote = useRef(false);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { isDisconnected, address } = useVortexAccount();
  const [initializeFailedMessage, setInitializeFailedMessage] = useState<string | null>(null);
  const [apiInitializeFailed, setApiInitializeFailed] = useState(false);
  const [_, setIsReady] = useState(false);
  const [cachedId, setCachedId] = useState<string | undefined>(undefined);
  const { t } = useTranslation();
  const { showToast, ToastMessage } = useToastMessage();
  // This cache is used to show an error message to the user if the chosen input amount
  // is expected to result in an output amount that is above the maximum withdrawal amount defined by the anchor
  const [exchangeRateCache, setExchangeRateCache] = useState<ExchangeRateCache>({
    usdc: { ars: 1200, eurc: 0.95, brl: 5.7 },
    usdce: { ars: 1200, eurc: 0.95, brl: 5.7 },
    usdt: { ars: 1200, eurc: 0.95, brl: 5.7 },
  });

  const { trackEvent } = useEventsContext();
  const { selectedNetwork, setNetworkSelectorDisabled } = useNetwork();

  const {
    error: signingServiceError,
    isLoading: isSigningServiceLoading,
    isError: isSigningServiceError,
  } = useSigningService();

  useEffect(() => {
    if (!pendulumNode.apiComponents?.api && pendulumNode?.isFetched) {
      setApiInitializeFailed(true);
      trackEvent({ event: 'initialization_error', error_message: 'node_connection_issue' });
    }
    if (pendulumNode.apiComponents?.api) {
      setApi(pendulumNode.apiComponents.api);
    }
  }, [pendulumNode, trackEvent, setApiInitializeFailed]);

  // TODO Replace with initializeFailed from offrampActions.
  const setInitializeFailed = useCallback(
    (message?: string | null) => {
      setInitializeFailedMessage(message ?? t('pages.swap.error.initializeFailed.default'));
      Sentry.captureMessage(`App initialization failed: ${message}`);
    },
    [t],
  );
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

  const offrampStarted = useOfframpStarted();
  const offrampState = useOfframpState();
  const offrampKycStarted = useOfframpKycStarted();
  const offrampSigningPhase = useOfframpSigningPhase();
  const { setOfframpInitiating, setOfframpExecutionInput, clearInitializeFailedMessage, setOfframpSummaryVisible } =
    useOfframpActions();
  const isOfframpSummaryVisible = useOfframpSummaryVisible();
  const executionInput = useOfframpExecutionInput();

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

  const fromToken = getInputTokenDetailsOrDefault(selectedNetwork, from);
  const toToken = getOutputTokenDetails(to);
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
      setExchangeRateCache((prev) => ({
        ...prev,
        [from]: { ...prev[from], [to]: tokenOutAmount.data?.effectiveExchangeRate },
      }));
    } else if (!tokenOutAmount.isLoading || tokenOutAmount.error) {
      form.setValue('toAmount', '0');
    } else {
      // Do nothing
    }
  }, [form, tokenOutAmount.data, tokenOutAmount.error, tokenOutAmount.isLoading, toToken, from, to]);

  // Clear initialize failed message when the user changes output token, amount or tax id field
  useEffect(() => {
    clearInitializeFailedMessage();
  }, [clearInitializeFailedMessage, to, taxId, fromAmount]);

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
  }, [ToastMessage.KYC_COMPLETED, showToast]);

  useEffect(() => {
    const isNetworkSelectorDisabled = offrampState?.phase !== undefined;
    setNetworkSelectorDisabled(isNetworkSelectorDisabled);
  }, [offrampState, setNetworkSelectorDisabled]);

  function getCurrentErrorMessage() {
    if (isDisconnected) return;

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0)) {
        trackEvent({
          event: 'form_error',
          error_message: 'insufficient_balance',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });

        return t('pages.swap.error.insufficientFunds', {
          userInputTokenBalance,
          assetSymbol: fromToken?.assetSymbol,
        });
      }
    }

    const amountOut = tokenOutAmount.data?.roundedDownQuotedAmountOut;

    const maxAmountUnits = multiplyByPowerOfTen(Big(toToken.maxWithdrawalAmountRaw), -toToken.decimals);
    const minAmountUnits = multiplyByPowerOfTen(Big(toToken.minWithdrawalAmountRaw), -toToken.decimals);

    const exchangeRate = tokenOutAmount.data?.effectiveExchangeRate || exchangeRateCache[from]?.[to];

    if (fromAmount && exchangeRate && maxAmountUnits.lt(fromAmount.mul(exchangeRate))) {
      trackEvent({
        event: 'form_error',
        error_message: 'more_than_maximum_withdrawal',
        input_amount: fromAmount ? fromAmount.toString() : '0',
      });

      return t('pages.swap.error.moreThanMaximumWithdrawal', {
        maxAmountUnits: stringifyBigWithSignificantDecimals(maxAmountUnits, 2),
        assetSymbol: toToken.fiat.symbol,
      });
    }

    if (amountOut !== undefined) {
      if (!config.test.overwriteMinimumTransferAmount && minAmountUnits.gt(amountOut)) {
        trackEvent({
          event: 'form_error',
          error_message: 'less_than_minimum_withdrawal',
          input_amount: fromAmount ? fromAmount.toString() : '0',
        });

        return t('pages.swap.error.lessThanMinimumWithdrawal', {
          minAmountUnits: stringifyBigWithSignificantDecimals(minAmountUnits, 2),
          assetSymbol: toToken.fiat.symbol,
        });
      }
    }

    if (tokenOutAmount.error?.includes('Insufficient liquidity')) {
      return t('pages.swap.error.insufficientLiquidity');
    }
    return tokenOutAmount.error;
  }

  const definitions: TokenDefinition[] =
    tokenSelectModalType === 'from'
      ? Object.entries(INPUT_TOKEN_CONFIG[selectedNetwork]).map(([key, value]) => ({
          type: key as InputTokenType,
          assetSymbol: value.assetSymbol,
          assetIcon: value.networkAssetIcon,
        }))
      : Object.entries(OUTPUT_TOKEN_CONFIG).map(([key, value]) => ({
          type: getEnumKeyByStringValue(OutputTokenTypes, key) as OutputTokenType,
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

  const handleOfframpSubmit = useCallback(() => {
    if (!address) {
      setInitializeFailed(t('pages.swap.error.initializeFailed.noAddress'));
      return;
    }
    if (!pendulumNode.apiComponents) {
      setInitializeFailed(t('pages.swap.error.initializeFailed.noApiComponents'));
      return;
    }
    to === OutputTokenTypes.BRL
      ? handleBrlaOfframpStart(executionInput, selectedNetwork, address, pendulumNode.apiComponents)
      : handleOnAnchorWindowOpen();
  }, [
    address,
    pendulumNode.apiComponents,
    to,
    handleBrlaOfframpStart,
    executionInput,
    selectedNetwork,
    handleOnAnchorWindowOpen,
    setInitializeFailed,
    t,
  ]);

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
      (offrampState?.phase === 'pendulumFundEphemeral' || offrampState?.phase === 'executeAssetHubToPendulumXCM');
    const showMainScreenAnyway =
      offrampState === undefined ||
      ['prepareTransactions', 'squidRouter'].includes(offrampState.phase) ||
      isAssetHubFlow;
    if (!showMainScreenAnyway) {
      return <ProgressPage offrampingState={offrampState} />;
    }
  }

  const onSwapConfirm = () => {
    if (offrampStarted) {
      return;
    }

    const validInputs = validateSwapInputs(inputAmountIsStable, address, fromAmount, tokenOutAmount.data);
    if (!validInputs) {
      return;
    }

    setOfframpInitiating(true);

    const outputToken = getOutputTokenDetails(to);
    const inputToken = getInputTokenDetailsOrDefault(selectedNetwork, from);

    const { expectedRedeemAmountRaw, inputAmountRaw } = calculateSwapAmountsWithMargin(
      validInputs.fromAmount,
      validInputs.tokenOutAmountData.preciseQuotedAmountOut,
      inputToken,
      outputToken,
    );

    const effectiveExchangeRate = validInputs.tokenOutAmountData.effectiveExchangeRate;
    const inputAmountUnits = fromAmountString;

    const outputAmountBeforeFees = validInputs.tokenOutAmountData.roundedDownQuotedAmountOut;
    const outputAmountAfterFees = calculateTotalReceive(outputAmountBeforeFees, outputToken);
    const outputAmountUnits = {
      beforeFees: outputAmountBeforeFees.toFixed(2, 0),
      afterFees: outputAmountAfterFees,
    };

    if (!api) {
      setInitializeFailed(t('pages.swap.error.initializeFailed.noApi'));
      return;
    }

    if (!address) {
      setInitializeFailed(t('pages.swap.error.initializeFailed.noAddress'));
      return;
    }

    const executionInput = {
      inputTokenType: from,
      outputTokenType: to,
      effectiveExchangeRate,
      inputAmountUnits,
      outputAmountUnits,
      setInitializeFailed,
      taxId: taxId,
      pixId: pixId,
      api: api,
      requiresSquidRouter: isNetworkEVM(selectedNetwork),
      expectedRedeemAmountRaw,
      inputAmountRaw,
      address: address,
      network: selectedNetwork,
    };

    setOfframpExecutionInput(executionInput);

    performSwapInitialChecks()
      .then(() => {
        console.log('Initial checks completed. Starting process..');
        handleOnSubmit(executionInput);
      })
      .catch((_error) => {
        console.error('Error during swap confirmation:', _error);
        setOfframpInitiating(false);
        setInitializeFailed();
      });
  };

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
          tokenOutAmount={tokenOutAmount}
          fromAmount={fromAmount}
          feeComparisonRef={feeComparisonRef}
          inputAmountIsStable={inputAmountIsStable}
          trackQuote={trackQuote}
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
          {t('pages.swap.developedBy')} <img src={satoshipayLogo} alt="Satoshipay" className="h-4" />
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
        trackQuote={trackQuote.current}
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
