import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
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
import { useInputTokenBalance } from '../../hooks/useInputTokenBalance';
import { UserBalance } from '../../components/UserBalance';

const Arrow = () => (
  <div className="flex justify-center w-full my-5">
    <ArrowDownIcon className="text-blue-700 w-7" />
  </div>
);

export const SwapPage = () => {
  const [isQuoteSubmitted, setIsQuoteSubmitted] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);
  const [api, setApi] = useState<ApiPromise | null>(null);

  const { isDisconnected } = useAccount();

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api } = await manager.getApiComponents();
      setApi(api);
    };

    initializeApiManager().catch(console.error);
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
    signingPhase,
    sep24FirstInterval,
  } = useMainProcess();

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

  const fromToken = INPUT_TOKEN_CONFIG[from];
  const toToken = OUTPUT_TOKEN_CONFIG[to];

  const userInputTokenBalance = useInputTokenBalance({ fromToken });

  const tokenOutData = useTokenOutAmount({
    wantsSwap: true,
    api,
    inputTokenType: from,
    outputTokenType: to,
    maximumFromAmount: undefined,
    fromAmountString,
    form,
  });

  const inputAmountIsStable =
    tokenOutData.stableAmountInUnits !== undefined && Big(tokenOutData.stableAmountInUnits).gt(Big(0));

  function onSubmit(e: Event) {
    e.preventDefault();

    if (!inputAmountIsStable) return;

    if (fromAmount === undefined) {
      console.log('Input amount is undefined');
      return;
    }

    const minimumOutputAmount = tokenOutData.data?.amountOut;
    if (minimumOutputAmount === undefined) {
      console.log('Output amount is undefined');
      return;
    }

    console.log('starting ....');

    handleOnSubmit({
      inputTokenType: from as InputTokenType,
      outputTokenType: to as OutputTokenType,
      amountInUnits: fromAmountString,
      minAmountOutUnits: minimumOutputAmount.preciseString,
    });
  }

  useEffect(() => {
    if (tokenOutData.data) {
      const toAmount = tokenOutData.data.amountOut.preciseBigDecimal.round(2, 0);
      // Calculate the final amount after the offramp fees
      const totalReceive = calculateTotalReceive(toAmount.toString(), toToken);
      form.setValue('toAmount', totalReceive);

      setIsQuoteSubmitted(false);
    } else {
      form.setValue('toAmount', '');
    }
  }, [form, tokenOutData.data, toToken]);

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        assetIcon={toToken.fiat.assetIcon}
        tokenSymbol={toToken.fiat.symbol}
        onClick={() => setModalType('to')}
        registerInput={form.register('toAmount')}
        disabled={isQuoteSubmitted || tokenOutData.isLoading}
        readOnly={true}
      />
    ),
    [toToken.fiat.symbol, toToken.fiat.assetIcon, form, isQuoteSubmitted, tokenOutData.isLoading, setModalType],
  );

  const WithdrawNumericInput = useMemo(
    () => (
      <>
        <AssetNumericInput
          registerInput={form.register('fromAmount', { onChange: () => setIsQuoteSubmitted(true) })}
          tokenSymbol={fromToken.assetSymbol}
          assetIcon={fromToken.polygonAssetIcon}
          onClick={() => setModalType('from')}
        />
        <UserBalance token={fromToken} />
      </>
    ),
    [form, fromToken, setModalType],
  );

  function getCurrentErrorMessage() {
    // Do not show any error if the user is disconnected
    if (isDisconnected) return;

    if (typeof userInputTokenBalance === 'string') {
      if (Big(userInputTokenBalance).lt(fromAmount ?? 0)) {
        return `Insufficient balance. Your balance is ${userInputTokenBalance} ${fromToken?.assetSymbol}.`;
      }
    }

    const amountOut = tokenOutData.data?.amountOut;

    if (amountOut !== undefined) {
      const maxAmountRaw = Big(toToken.maxWithdrawalAmountRaw);
      const minAmountRaw = Big(toToken.minWithdrawalAmountRaw);

      if (maxAmountRaw.lt(Big(amountOut.rawBalance))) {
        const maxAmountUnits = multiplyByPowerOfTen(maxAmountRaw, -toToken.decimals);
        return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }

      if (config.test.overwriteMinimumTransferAmount === false && minAmountRaw.gt(Big(amountOut.rawBalance))) {
        const minAmountUnits = multiplyByPowerOfTen(minAmountRaw, -toToken.decimals);
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.fiat.symbol
        }.`;
      }
    }

    return tokenOutData.error;
  }

  const definitions =
    modalType === 'from'
      ? Object.entries(INPUT_TOKEN_CONFIG).map(([key, value]) => ({
          type: key as InputTokenType,
          assetSymbol: value.assetSymbol,
          assetIcon: value.polygonAssetIcon,
        }))
      : Object.entries(OUTPUT_TOKEN_CONFIG).map(([key, value]) => ({
          type: key as OutputTokenType,
          assetSymbol: value.fiat.symbol,
          assetIcon: value.fiat.assetIcon,
        }));

  const modals = (
    <PoolSelectorModal
      open={!!modalType}
      onSelect={modalType === 'from' ? onFromChange : onToChange}
      definitions={definitions}
      selected={modalType === 'from' ? from : to}
      onClose={() => setModalType(undefined)}
    />
  );

  if (offrampingState?.phase === 'success') {
    return <SuccessPage finishOfframping={finishOfframping} transactionId={firstSep24ResponseState?.id} />;
  }

  if (offrampingState?.isFailure === true) {
    return (
      <FailurePage
        finishOfframping={finishOfframping}
        continueFailedFlow={continueFailedFlow}
        transactionId={firstSep24ResponseState?.id}
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
        className="max-w-2xl px-4 py-8 mx-4 mt-12 mb-12 rounded-lg shadow-custom md:mx-auto md:w-2/3 lg:w-3/5 xl:w-1/2"
        onSubmit={onSubmit}
      >
        <h1 className="mb-5 text-3xl font-bold text-center text-blue-700">Withdraw</h1>
        <LabeledInput label="You withdraw" Input={WithdrawNumericInput} />
        <Arrow />
        <LabeledInput label="You receive" Input={ReceiveNumericInput} />
        <p className="text-red-600 mb-6">{getCurrentErrorMessage()}</p>
        <FeeCollapse
          fromAmount={fromAmount?.toString()}
          toAmount={tokenOutData.data?.amountOut.preciseString}
          toToken={toToken}
          exchangeRate={
            <ExchangeRate
              {...{
                tokenOutData,
                fromToken,
                toTokenSymbol: toToken.fiat.symbol,
              }}
            />
          }
        />
        <section className="flex items-center justify-center w-full mt-5">
          <BenefitsList amount={fromAmount} currency={from} />
        </section>
        {firstSep24ResponseState?.url !== undefined && sep24FirstInterval !== undefined ? (
          <a
            href={firstSep24ResponseState.url}
            target="_blank"
            rel="noreferrer"
            className="w-full mt-5 text-white bg-blue-700 btn rounded-xl"
            onClick={handleOnAnchorWindowOpen}
          >
            Start Offramping
          </a>
        ) : (
          <SwapSubmitButton
            text={offrampingStarted ? 'Offramping in Progress' : 'Confirm'}
            disabled={Boolean(getCurrentErrorMessage()) || !inputAmountIsStable}
            pending={offrampingStarted || offrampingState !== undefined}
          />
        )}
      </form>
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
