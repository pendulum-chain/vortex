import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useAccount } from 'wagmi';
import Big from 'big.js';
import { ArrowDownIcon } from '@heroicons/react/20/solid';

import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { FeeCollapse } from '../../components/FeeCollapse';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { ExchangeRate } from '../../components/ExchangeRate';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { SwapSubmitButton } from '../../components/buttons/SwapSubmitButton';
import { DialogBox } from '../../components/DialogBox';
import { BankDetails } from './sections/BankDetails';
import { config } from '../../config';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { BaseLayout } from '../../layouts';

import { useMainProcess } from '../../hooks/useMainProcess';
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';
import { ProgressPage } from '../progress';
import { SuccessPage } from '../success';
import { FailurePage } from '../failure';

const Arrow = () => (
  <div className="flex justify-center w-full my-5">
    <ArrowDownIcon className="text-blue-700 w-7" />
  </div>
);

export const SwapPage = () => {
  const [isSubmitButtonDisabled, setIsSubmitButtonDisabled] = useState(true);
  const [isExchangeSectionSubmitted, setIsExchangeSectionSubmitted] = useState(false);
  const [isExchangeSectionSubmittedError, setIsExchangeSectionSubmittedError] = useState(false);
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
  const { handleOnSubmit, finishOfframping, offrampingStarted, sep24Url, sep24Id, offrampingPhase } = useMainProcess();

  const {
    tokensModal: [modalType, setModalType],
    onFromChange,
    onToChange,
    form,
    fromAmount,
    fromAmountString,
    from,
    to,
    reset,
  } = useSwapForm();

  const fromToken = from ? INPUT_TOKEN_CONFIG[from] : undefined;
  const toToken = to ? OUTPUT_TOKEN_CONFIG[to] : undefined;

  useEffect(() => {
    if (form.formState.isDirty && isExchangeSectionSubmitted && isDisconnected) {
      setIsExchangeSectionSubmitted(false);
      reset();
    }
  }, [form.formState.isDirty, isDisconnected, isExchangeSectionSubmitted, reset]);

  const tokenOutData = useTokenOutAmount({
    wantsSwap: true,
    api,
    inputTokenType: from,
    outputTokenType: to,
    maximumFromAmount: undefined,
    slippageBasisPoints: config.swap.slippageBasisPoints,
    axelarSlippageBasisPoints: config.swap.axelarSlippageBasisPoints,
    fromAmountString,
    xcmFees: config.xcm.fees,
    form,
  });

  const inputAmountIsStable =
    tokenOutData.actualAmountInRaw !== undefined && BigInt(tokenOutData.actualAmountInRaw) > 0n;

  // Check only the first part of the form (without Bank Details)
  const isFormValidWithoutBankDetails = useMemo(() => {
    const errors = form.formState.errors;
    const noErrors = !errors.from && !errors.to && !errors.fromAmount && !errors.toAmount;
    const isValid =
      Boolean(from) && Boolean(to) && Boolean(fromAmount) && Boolean(tokenOutData.data?.amountOut.preciseString);

    return noErrors && isValid;
  }, [form.formState.errors, from, fromAmount, to, tokenOutData.data?.amountOut.preciseString]);

  function onSubmit(e: Event) {
    e.preventDefault();

    if (isSubmitButtonDisabled || !inputAmountIsStable || tokenOutData.actualAmountInRaw === undefined) return;

    if (!isExchangeSectionSubmitted) {
      if (isFormValidWithoutBankDetails) {
        setIsExchangeSectionSubmittedError(false);
        setIsExchangeSectionSubmitted(true);
      } else {
        setIsExchangeSectionSubmittedError(true);
      }

      return;
    }

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
      nablaAmountInRaw: tokenOutData.actualAmountInRaw,
      minAmountOutUnits: minimumOutputAmount.preciseString,
    });
  }

  useEffect(() => {
    if (isExchangeSectionSubmitted) {
      formRef.current && formRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isExchangeSectionSubmitted]);

  useEffect(() => {
    if (tokenOutData.data) {
      const toAmount = tokenOutData.data.amountOut.preciseBigDecimal.round(2, 0);
      form.setValue('toAmount', stringifyBigWithSignificantDecimals(toAmount, 2));

      setIsQuoteSubmitted(false);
    } else {
      form.setValue('toAmount', '');
    }
  }, [form, tokenOutData.data]);

  // Check if the Submit button should be enabled
  useEffect(() => {
    // Validate only the first part of the form (without Bank Details)
    if (!isExchangeSectionSubmitted && isFormValidWithoutBankDetails) {
      setIsSubmitButtonDisabled(false);
    }
    // Validate the whole form (with Bank Details)
    else if (isExchangeSectionSubmitted /*&& form.formState.isValid*/) {
      setIsSubmitButtonDisabled(false);
    } else {
      setIsSubmitButtonDisabled(true);
    }
  }, [form.formState, form.formState.isValid, isExchangeSectionSubmitted, isFormValidWithoutBankDetails]);

  const ReceiveNumericInput = useMemo(
    () => (
      <AssetNumericInput
        additionalText="PIX / Bank Account"
        tokenType={to}
        tokenSymbol={toToken?.stellarAsset.code.string}
        onClick={() => setModalType('to')}
        registerInput={form.register('toAmount')}
        disabled={isQuoteSubmitted || tokenOutData.isLoading}
        readOnly={true}
      />
    ),
    [to, toToken?.stellarAsset.code.string, form, isQuoteSubmitted, tokenOutData.isLoading, setModalType],
  );

  const WidthrawNumericInput = useMemo(
    () => (
      <AssetNumericInput
        registerInput={form.register('fromAmount', { onChange: () => setIsQuoteSubmitted(true) })}
        tokenType={from}
        tokenSymbol={fromToken?.assetSymbol}
        onClick={() => setModalType('from')}
      />
    ),
    [form, from, fromToken?.assetSymbol, setModalType],
  );

  function getCurrentErrorMessage() {
    if (isExchangeSectionSubmittedError) {
      return 'You must first enter the amount you wish to withdraw.';
    }

    const amountOut = tokenOutData.data?.amountOut;

    if (amountOut !== undefined && toToken !== undefined) {
      const maxAmountRaw = Big(toToken.maxWithdrawalAmountRaw);
      const minAmountRaw = Big(toToken.minWithdrawalAmountRaw);

      if (maxAmountRaw.lt(Big(amountOut.rawBalance))) {
        const maxAmountUnits = multiplyByPowerOfTen(maxAmountRaw, -toToken.decimals);
        return `Maximum withdrawal amount is ${stringifyBigWithSignificantDecimals(maxAmountUnits, 2)} ${
          toToken.stellarAsset.code.string
        }.`;
      }

      if (config.test.overwriteMinimumTransferAmount === false && minAmountRaw.gt(Big(amountOut.rawBalance))) {
        const minAmountUnits = multiplyByPowerOfTen(minAmountRaw, -toToken.decimals);
        return `Minimum withdrawal amount is ${stringifyBigWithSignificantDecimals(minAmountUnits, 2)} ${
          toToken.stellarAsset.code.string
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
        }))
      : Object.entries(OUTPUT_TOKEN_CONFIG).map(([key, value]) => ({
          type: key as OutputTokenType,
          assetSymbol: value.stellarAsset.code.string,
        }));

  const modals = (
    <PoolSelectorModal
      open={!!modalType}
      onSelect={modalType === 'from' ? onFromChange : onToChange}
      definitions={definitions as any}
      selected={modalType === 'from' ? from : to}
      onClose={() => setModalType(undefined)}
      isLoading={false}
    />
  );

  if (offrampingPhase === 'success') {
    return <SuccessPage finishOfframping={finishOfframping} transactionId={sep24Id} />;
  }

  if (offrampingPhase === 'failure') {
    return <FailurePage finishOfframping={finishOfframping} transactionId={sep24Id} />;
  }

  if (offrampingPhase !== undefined || offrampingStarted) {
    return <ProgressPage />;
  }

  const main = (
    <main ref={formRef}>
      <DialogBox />
      <form
        className="w-full max-w-2xl px-4 py-8 mx-4 mt-12 mb-12 rounded-lg shadow-custom md:mx-auto md:w-2/3 lg:w-3/5 xl:w-1/2"
        onSubmit={onSubmit}
      >
        <h1 className="mb-5 text-3xl font-bold text-center text-blue-700">Withdraw</h1>
        <LabeledInput label="You withdraw" Input={WidthrawNumericInput} />
        <Arrow />
        <LabeledInput label="You receive" Input={ReceiveNumericInput} />
        <p className="text-red-600">{getCurrentErrorMessage()}</p>
        <ExchangeRate {...{ tokenOutData, fromToken, toToken }} />
        <FeeCollapse
          fromAmount={fromAmount?.toString()}
          toAmount={tokenOutData.data?.amountOut.preciseString}
          toCurrency={to}
        />
        <section className="flex items-center justify-center w-full mt-5">
          <BenefitsList amount={fromAmount} currency={from} />
        </section>
        {isExchangeSectionSubmitted ? (
          <BankDetails
            registerBankAccount={form.register('bankAccount')}
            registerTaxNumber={form.register('taxNumber')}
          />
        ) : (
          <></>
        )}
        {sep24Url !== undefined ? (
          <a
            href={sep24Url}
            target="_blank"
            rel="noreferrer"
            className="w-full mt-5 text-white bg-blue-700 btn rounded-xl"
          >
            Start Offramping
          </a>
        ) : (
          <SwapSubmitButton
            text={isExchangeSectionSubmitted ? 'Confirm' : 'Continue'}
            disabled={isSubmitButtonDisabled || Boolean(getCurrentErrorMessage()) || !inputAmountIsStable}
          />
        )}
      </form>
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
