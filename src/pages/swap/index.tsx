import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Fragment } from 'preact';
import { ArrowDownIcon } from '@heroicons/react/20/solid';
import { useAccount } from 'wagmi';
import Big from 'big.js';

import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { calculateTotalReceive, FeeCollapse } from '../../components/FeeCollapse';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { ExchangeRate } from '../../components/ExchangeRate';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { SwapSubmitButton } from '../../components/buttons/SwapSubmitButton';
import { SigningBox } from '../../components/SigningBox';
import { config } from '../../config';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { BaseLayout } from '../../layouts';

import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { useMainProcess } from '../../hooks/useMainProcess';
import { ProgressPage } from '../progress';
import { SuccessPage } from '../success';
import { FailurePage } from '../failure';
import { TermsAndConditions } from '../../components/TermsAndConditions';
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { UserBalance } from '../../components/UserBalance';
import { useEventsContext } from '../../contexts/events';
import { showToast, ToastMessage } from '../../helpers/notifications';

import { testRoute } from '../../services/squidrouter/route';
import { initialChecks } from '../../services/initialChecks';
import { getVaultsForCurrency } from '../../services/polkadot/spacewalk';
import { SPACEWALK_REDEEM_SAFETY_MARGIN } from '../../constants/constants';
import { FeeComparison } from '../../components/FeeComparison';

const Arrow = () => (
  <div className="flex justify-center w-full my-5">
    <ArrowDownIcon className="text-blue-700 w-7" />
  </div>
);

export const SwapPage = () => {
  const formRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { isDisconnected, address } = useAccount();
  const [initializeFailed, setInitializeFailed] = useState(false);
  const [isReady, setIsReady] = useState(false);
  const [showCompareFees, setShowCompareFees] = useState(false);
  const [cachedId, setCachedId] = useState<string | undefined>(undefined);
  const { trackEvent } = useEventsContext();

  // FIXME - use the correct network type from the network selector once implemented
  const network = 'AssetHub';

  // Hook used for services on initialization and pre-offramp check
  // That is why no dependencies are used
  useEffect(() => {
    const initializeApp = async () => {
      const manager = await getApiManagerInstance();
      const { api } = await manager.getApiComponents();
      setApi(api);
      await initialChecks();
    };

    initializeApp()
      .then(() => {
        setIsReady(true);
      })
      .catch(() => {
        setInitializeFailed(true);
      });
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
  } = useMainProcess();

  // Store the id as it is cleared after the user opens the anchor window
  useEffect(() => {
    if (firstSep24ResponseState?.id != undefined) {
      setCachedId(firstSep24ResponseState?.id);
    }
  }, [firstSep24ResponseState?.id]);

  const {
    tokensModal: [modalType, setModalType],
    onFromChange,
    onToChange,
    form,
    fromAmount,
    fromAmountString,
    from,
    to,
  } = useSwapForm();

  const fromToken = INPUT_TOKEN_CONFIG[network][from];
  const toToken = OUTPUT_TOKEN_CONFIG[to];
  const formToAmount = form.watch('toAmount');
  const vortexPrice = formToAmount ? Big(formToAmount) : Big(0);

  const userInputTokenBalance = useInputTokenBalance({ fromToken });

  const tokenOutAmount = useTokenOutAmount({
    wantsSwap: true,
    api,
    inputTokenType: from,
    outputTokenType: to,
    maximumFromAmount: undefined,
    fromAmountString,
    form,
    network,
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
    const inputToken = INPUT_TOKEN_CONFIG[network][from];
    if (!inputToken) {
      console.log(`Input token ${from} not supported on network ${network}`);
      return;
    }

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
      testRoute(fromToken!, inputAmountRaw, address!), // Address is both sender and receiver (in different chains)
    ])
      .then(() => {
        console.log('Initial checks completed. Starting process..');
        handleOnSubmit({
          inputTokenType: from as InputTokenType,
          outputTokenType: to as OutputTokenType,
          amountInUnits: fromAmountString,
          offrampAmount: tokenOutAmountData.roundedDownQuotedAmountOut,
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
    const handleMessage = (event: any) => {
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

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => setModalType('to')}
        registerInput={form.register('toAmount')}
        disabled={tokenOutAmount.isLoading}
        readOnly={true}
        id="toAmount"
      />
    ),
    [toToken.fiat.symbol, toToken.fiat.assetIcon, form, tokenOutAmount.isLoading, setModalType],
  );

  const WithdrawNumericInput = useMemo(
    () =>
      fromToken ? (
        <>
          <AssetNumericInput
            registerInput={form.register('fromAmount')}
            tokenSymbol={fromToken.assetSymbol}
            assetIcon={fromToken.networkAssetIcon}
            onClick={() => setModalType('from')}
            id="fromAmount"
          />
          <UserBalance token={fromToken} onClick={(amount: string) => form.setValue('fromAmount', amount)} />
        </>
      ) : undefined,
    [form, fromToken, setModalType],
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

      if (config.test.overwriteMinimumTransferAmount === false && minAmountUnits.gt(amountOut)) {
        trackEvent({ event: 'form_error', error_message: 'less_than_minimum_withdrawal' });
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }
    }

    return tokenOutAmount.error;
  }

  const definitions =
    modalType === 'from'
      ? Object.entries(INPUT_TOKEN_CONFIG[network]).map(([key, value]) => ({
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
        open={!!modalType}
        onSelect={modalType === 'from' ? onFromChange : onToChange}
        definitions={definitions}
        selected={modalType === 'from' ? from : to}
        onClose={() => setModalType(undefined)}
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
    const showMainScreenAnyway =
      offrampingState === undefined || ['prepareTransactions', 'squidRouter'].includes(offrampingState.phase);
    if (!showMainScreenAnyway) {
      return <ProgressPage offrampingState={offrampingState} />;
    }
  }

  const main = (
    <main ref={formRef}>
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
          {initializeFailed && (
            <p className="text-red-600">
              Application initialization failed. Please reload, or try again later if the problem persists.
            </p>
          )}
        </section>
        <div className="flex mt-5 gap-3">
          <button
            className="grow btn-vortex-secondary btn"
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
              className="grow btn-vortex-primary btn rounded-xl"
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
          network={fromToken.network}
        />
      )}
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
