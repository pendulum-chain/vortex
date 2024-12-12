import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Fragment } from 'preact';
import { useAccount } from 'wagmi';
import { ArrowDownIcon } from '@heroicons/react/20/solid';
import Big from 'big.js';

import { ApiPromise } from '@polkadot/api';

import { calculateTotalReceive, FeeCollapse } from '../../components/FeeCollapse';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { SwapSubmitButton } from '../../components/buttons/SwapSubmitButton';
import { TermsAndConditions } from '../../components/TermsAndConditions';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { FeeComparison } from '../../components/FeeComparison';
import { BenefitsList } from '../../components/BenefitsList';
import { ExchangeRate } from '../../components/ExchangeRate';
import { LabeledInput } from '../../components/LabeledInput';
import { UserBalance } from '../../components/UserBalance';
import { SigningBox } from '../../components/SigningBox';
import { SignInModal } from '../../components/SignIn';

import { SPACEWALK_REDEEM_SAFETY_MARGIN } from '../../constants/constants';
import {
  getInputTokenDetailsOrDefault,
  INPUT_TOKEN_CONFIG,
  InputTokenType,
  OUTPUT_TOKEN_CONFIG,
  OutputTokenType,
} from '../../constants/tokenConfig';
import { config } from '../../config';

import { useEventsContext } from '../../contexts/events';
import { Networks, useNetwork } from '../../contexts/network';
import { usePendulumNode } from '../../contexts/polkadotNode';
import { useSiweContext } from '../../contexts/siwe';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { showToast, ToastMessage } from '../../helpers/notifications';

import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { useMainProcess } from '../../hooks/offramp/useMainProcess';

import { getVaultsForCurrency } from '../../services/phases/polkadot/spacewalk';
import { testRoute } from '../../services/phases/squidrouter/route';
import { initialChecks } from '../../services/initialChecks';

import { BaseLayout } from '../../layouts';
import { ProgressPage } from '../progress';
import { FailurePage } from '../failure';
import { SuccessPage } from '../success';

const Arrow = () => (
  <div className="flex justify-center w-full my-5">
    <ArrowDownIcon className="text-blue-700 w-7" />
  </div>
);

export const SwapPage = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const pendulumNode = usePendulumNode();
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { isDisconnected, address } = useAccount();
  const [initializeFailed, setInitializeFailed] = useState(false);
  const [apiInitializeFailed, setApiInitializeFailed] = useState(false);
  const [_, setIsReady] = useState(false);
  const [showCompareFees, setShowCompareFees] = useState(false);
  const [cachedId, setCachedId] = useState<string | undefined>(undefined);
  const { trackEvent } = useEventsContext();
  const { selectedNetwork, setNetworkSelectorDisabled } = useNetwork();
  const { signingPending, handleSign, handleCancel } = useSiweContext();

  useEffect(() => {
    setApiInitializeFailed(!pendulumNode.apiComponents?.api && pendulumNode?.isFetched);
    if (pendulumNode.apiComponents?.api) {
      setApi(pendulumNode.apiComponents.api);
    }
  }, [pendulumNode]);

  useEffect(() => {
    const initialize = async () => {
      try {
        await initialChecks();
        setIsReady(true);
      } catch (error) {
        setInitializeFailed(true);
      }
    };

    initialize();
  }, []);

  // Main process hook
  const {
    handleOnSubmit,
    finishOfframping,
    continueFailedFlow,
    offrampingStarted,
    firstSep24ResponseState,
    handleOnAnchorWindowOpen,
    offrampingState,
    isInitiating,
    signingPhase,
    setIsInitiating,
    maybeCancelSep24First,
  } = useMainProcess();

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
  } = useSwapForm();

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

  function onConfirm(e: Event) {
    e.preventDefault();

    if (!inputAmountIsStable) return;
    if (!address) return; // Address must exist as this point.

    if (fromAmount === undefined) {
      console.log('Input amount is undefined');
      return;
    }

    const tokenOutAmountData = tokenOutAmount.data;
    if (!tokenOutAmountData) {
      console.log('Output amount is undefined');
      return;
    }

    const preciseQuotedAmountOut = tokenOutAmountData.preciseQuotedAmountOut;

    // test the route for starting token, then proceed
    // will disable the confirm button
    setIsInitiating(true);

    const outputToken = OUTPUT_TOKEN_CONFIG[to];
    const inputToken = getInputTokenDetailsOrDefault(selectedNetwork, from);

    // both route and stellar vault checks must be valid to proceed
    const outputAmountBigMargin = preciseQuotedAmountOut.preciseBigDecimal
      .round(2, 0)
      .mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN); // add an X percent margin to be sure
    const expectedRedeemAmountRaw = multiplyByPowerOfTen(outputAmountBigMargin, outputToken.decimals).toFixed();

    const inputAmountBig = Big(fromAmount);
    const inputAmountBigMargin = inputAmountBig.mul(1 + SPACEWALK_REDEEM_SAFETY_MARGIN);
    const inputAmountRaw = multiplyByPowerOfTen(inputAmountBigMargin, inputToken.decimals).toFixed();

    Promise.all([
      getVaultsForCurrency(
        api!,
        outputToken.stellarAsset.code.hex,
        outputToken.stellarAsset.issuer.hex,
        expectedRedeemAmountRaw,
      ),
      testRoute(fromToken, inputAmountRaw, address!, selectedNetwork), // Address is both sender and receiver (in different chains)
    ])
      .then(() => {
        console.log('Initial checks completed. Starting process..');
        handleOnSubmit({
          inputTokenType: from as InputTokenType,
          outputTokenType: to as OutputTokenType,
          amountInUnits: fromAmountString,
          offrampAmount: tokenOutAmountData.roundedDownQuotedAmountOut,
          setInitializeFailed,
        });
      })
      .catch((_error) => {
        setIsInitiating(false);
        setInitializeFailed(true);
      });
  }

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
    if (offrampingState?.phase !== undefined) {
      setNetworkSelectorDisabled(true);
    }
  }, [offrampingState, setNetworkSelectorDisabled]);

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
    // Do not show any error if the user is disconnected
    if (isDisconnected) return;

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0)) {
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
        }));

  const modals = (
    <>
      <TermsAndConditions />
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

  if (offrampingState?.phase === 'success') {
    return <SuccessPage finishOfframping={finishOfframping} transactionId={cachedId} toToken={to} />;
  }

  if (offrampingState?.failure !== undefined) {
    return (
      <FailurePage
        finishOfframping={finishOfframping}
        continueFailedFlow={continueFailedFlow}
        transactionId={cachedId}
        failure={offrampingState.failure}
      />
    );
  }

  if (offrampingState !== undefined || offrampingStarted) {
    const isAssetHubFlow =
      selectedNetwork === Networks.AssetHub &&
      (offrampingState?.phase === 'pendulumFundEphemeral' || offrampingState?.phase === 'executeAssetHubXCM');
    const showMainScreenAnyway =
      offrampingState === undefined ||
      ['prepareTransactions', 'squidRouter'].includes(offrampingState.phase) ||
      isAssetHubFlow;
    if (!showMainScreenAnyway) {
      return <ProgressPage offrampingState={offrampingState} />;
    }
  }

  const main = (
    <main ref={formRef}>
      <SignInModal signingPending={signingPending} closeModal={handleCancel} handleSignIn={handleSign} />
      <SigningBox step={signingPhase} />
      <form
        className="max-w-2xl px-4 py-8 mx-4 mt-12 mb-4 rounded-lg shadow-custom md:mx-auto md:w-2/3 lg:w-3/5 xl:w-1/2"
        onSubmit={onConfirm}
      >
        <h1 className="mb-5 text-3xl font-bold text-center text-blue-700">Withdraw</h1>
        <LabeledInput label="You withdraw" htmlFor="fromAmount" Input={WithdrawNumericInput} />
        <Arrow />
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
          {(initializeFailed || apiInitializeFailed) && (
            <p className="text-red-600">
              Application initialization failed. Please reload, or try again later if the problem persists.
            </p>
          )}
        </section>
        <div className="flex gap-3 mt-5">
          <button
            className="btn-vortex-secondary btn"
            style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
            disabled={!inputAmountIsStable}
            onClick={(e) => {
              e.preventDefault();
              setShowCompareFees(!showCompareFees);
              // Smooth scroll to bottom of page
              setTimeout(() => {
                window.scrollTo({ top: document.body.scrollHeight, behavior: 'smooth' });
              }, 300);
            }}
          >
            Compare fees
          </button>

          {firstSep24ResponseState?.url !== undefined ? (
            // eslint-disable-next-line react/jsx-no-target-blank
            <a
              href={firstSep24ResponseState.url}
              target="_blank"
              rel="opener" //noopener forbids the use of postMessages.
              className="btn-vortex-primary btn rounded-xl"
              style={{ flex: '1 1 calc(50% - 0.75rem/2)' }}
              onClick={handleOnAnchorWindowOpen}
              // open in a tinier window
            >
              Continue with Partner
            </a>
          ) : (
            <SwapSubmitButton
              text={isInitiating ? 'Confirming' : offrampingStarted ? 'Processing Details' : 'Confirm'}
              disabled={Boolean(getCurrentErrorMessage()) || !inputAmountIsStable}
              pending={isInitiating || offrampingStarted || offrampingState !== undefined}
            />
          )}
        </div>
      </form>
      {showCompareFees && fromToken && fromAmount && toToken && (
        <FeeComparison
          sourceAssetSymbol={fromToken.assetSymbol}
          amount={fromAmount}
          targetAssetSymbol={toToken.fiat.symbol}
          vortexPrice={vortexPrice}
          network={Networks.Polygon} // TODO, need to pass the proper selected network, unless it is substrate. Also, assuming it works with all supported EVMs
        />
      )}
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
