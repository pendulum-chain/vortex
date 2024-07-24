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
import { BankDetails } from './sections/BankDetails';
import { config } from '../../config';
import { INPUT_TOKEN_CONFIG, InputTokenType, OUTPUT_TOKEN_CONFIG, OutputTokenType } from '../../constants/tokenConfig';
import { BaseLayout } from '../../layouts';

import { useMainProcess } from '../../hooks/useMainProcess';
import { SwapOptions } from '../../types';
import { multiplyByPowerOfTen, stringifyBigWithSignificantDecimals } from '../../helpers/contracts';

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
  const { handleOnSubmit } = useMainProcess();

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
    fromAmountString,
    xcmFees: config.xcm.fees,
    form,
  });

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

    if (isSubmitButtonDisabled) return;

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
    // Hardcoding the selection SwapOptions since at least for now this will be always the case (no direct offramping on this UI)
    // TODO we need to pass the bank account/tax id also, required for sep12 probably.
    const swapOptions: SwapOptions = {
      assetIn: from,
      minAmountOut: tokenOutData.data?.amountOut.preciseBigDecimal,
    };
    handleOnSubmit({
      inputTokenType: from as InputTokenType,
      outputTokenType: to as OutputTokenType,
      amountInUnits: fromAmountString,
      minAmountOutUnits: minimumOutputAmount.preciseString,
    });
  }

  useEffect(() => {
    if (isExchangeSectionSubmitted) {
      formRef.current && formRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isExchangeSectionSubmitted]);

  useEffect(() => {
    const toAmount = Number(tokenOutData.data?.amountOut.preciseString);
    form.setValue('toAmount', isNaN(toAmount) ? '' : toAmount.toFixed(2));
    if (toAmount) {
      setIsQuoteSubmitted(false);
    }
  }, [form, fromAmount, tokenOutData]);

  // Check if the Submit button should be enabled
  useEffect(() => {
    // Validate only the first part of the form (without Bank Details)
    if (!isExchangeSectionSubmitted && isFormValidWithoutBankDetails) {
      setIsSubmitButtonDisabled(false);
    }
    // Validate the whole form (with Bank Details)
    else if (isExchangeSectionSubmitted && form.formState.isValid) {
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
    [toToken, form, isQuoteSubmitted, tokenOutData.isLoading, setModalType],
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
    [form, fromToken, setModalType],
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

      if (minAmountRaw.gt(Big(amountOut.rawBalance))) {
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

  const main = (
    <main ref={formRef}>
      <form
        className="w-full max-w-2xl px-4 py-8 mx-4 mt-12 mb-12 rounded-lg shadow-custom md:mx-8 md:mx-auto md:w-2/3 lg:w-3/5 xl:w-1/2"
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
        <SwapSubmitButton
          text={isExchangeSectionSubmitted ? 'Confirm' : 'Continue'}
          disabled={isSubmitButtonDisabled || Boolean(getCurrentErrorMessage())}
        />
      </form>
    </main>
  );

  return <BaseLayout modals={modals} main={main} />;
};
