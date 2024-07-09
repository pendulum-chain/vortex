import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useAccount } from 'wagmi';
import { ArrowDownIcon } from '@heroicons/react/20/solid';

import { Navbar } from '../../components/Navbar';
import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { Collapse } from '../../components/Collapse';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { ExchangeRate } from '../../components/ExchangeRate';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { SwapSubmitButton } from '../../components/buttons/SwapSubmitButton';
import { BankDetails } from './sections/BankDetails';

const Arrow = () => (
  <div className="w-full flex justify-center my-5">
    <ArrowDownIcon className="w-7 text-blue-700" />
  </div>
);

export const Swap = () => {
  const [isExchangeSectionSubmitted, setIsExchangeSectionSubmitted] = useState(false);
  const [isExchangeSectionSubmittedError, setIsExchangeSectionSubmittedError] = useState(false);
  const formRef = useRef<HTMLDivElement | null>(null);

  const [api, setApi] = useState<ApiPromise | null>(null);

  const { isDisconnected, address } = useAccount();
  const walletAccount: { address: string; source: string } = useMemo(
    () => ({ address: address || '', source: '' }),
    [address],
  );

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api } = await manager.getApiComponents();
      setApi(api);
    };

    initializeApiManager().catch(console.error);
  }, []);

  const {
    tokensModal: [modalType, setModalType],
    onFromChange,
    onToChange,
    form,
    fromAmount,
    fromToken,
    toToken,
    slippage,
    from,
    to,
    reset,
  } = useSwapForm();

  useEffect(() => {
    if (form.formState.isDirty && isExchangeSectionSubmitted && isDisconnected) {
      setIsExchangeSectionSubmitted(false);
      reset();
    }
  }, [form.formState.isDirty, isDisconnected, isExchangeSectionSubmitted, reset]);

  const tokenOutData = useTokenOutAmount({
    wantsSwap: true,
    api: api,
    walletAccount,
    fromAmount,
    fromToken: from,
    toToken: to,
    maximumFromAmount: undefined,
    slippage,
    form,
  });

  function onSubmit(e: Event) {
    e.preventDefault();

    if (!isExchangeSectionSubmitted) {
      const errors = form.formState.errors;
      const noErrors = !errors.from && !errors.to && !errors.fromAmount && !errors.toAmount;
      const isValid = Boolean(from) && Boolean(to) && Boolean(fromAmount);

      if (noErrors && isValid) {
        setIsExchangeSectionSubmittedError(false);
        setIsExchangeSectionSubmitted(true);
      } else {
        setIsExchangeSectionSubmittedError(true);
      }
      return;
    }
  }

  useEffect(() => {
    if (isExchangeSectionSubmitted) {
      formRef.current && formRef.current.scrollIntoView({ behavior: 'smooth', block: 'end' });
    }
  }, [isExchangeSectionSubmitted]);

  useEffect(() => {
    const toAmount = Number(tokenOutData.data?.amountOut.preciseString);
    form.setValue('toAmount', isNaN(toAmount) ? '' : toAmount.toFixed(2));
  }, [form, fromAmount, tokenOutData]);

  const ReceiveNumericInput = useMemo(
    // eslint-disable-next-line react/display-name
    () => () =>
      (
        <AssetNumericInput
          additionalText="PIX / Bank Account"
          fromToken={toToken}
          onClick={() => setModalType('to')}
          registerInput={form.register('toAmount')}
          disabled={tokenOutData.isLoading}
          readOnly={true}
        />
      ),
    [form, toToken, setModalType, tokenOutData.isLoading],
  );

  const WidthrawNumericInput = useMemo(
    // eslint-disable-next-line react/display-name
    () => () =>
      (
        <AssetNumericInput
          registerInput={form.register('fromAmount')}
          fromToken={fromToken}
          onClick={() => setModalType('from')}
        />
      ),
    [form, fromToken, setModalType],
  );

  return (
    <>
      <PoolSelectorModal
        open={!!modalType}
        mode={{ type: modalType, swap: true }}
        onSelect={modalType === 'from' ? onFromChange : onToChange}
        selected={{
          type: 'token',
          tokenAddress: modalType ? (modalType === 'from' ? fromToken?.assetCode : toToken?.assetCode) : undefined,
        }}
        onClose={() => setModalType(undefined)}
        isLoading={false}
      />
      <Navbar />
      <main className="flex justify-center items-center mt-12" ref={formRef}>
        <form
          className="shadow-custom px-4 py-8 rounded-lg mb-12 mx-8 md:mx-auto w-full md:w-2/3 lg:w-3/5 xl:w-1/2 max-w-2xl transition-[height] duration-1000"
          onSubmit={onSubmit}
        >
          <h1 className="text-3xl text-blue-700 font-bold text-center mb-5">Withdraw</h1>
          <LabeledInput label="You withdraw" Input={WidthrawNumericInput} />
          <Arrow />
          <LabeledInput label="You receive" Input={ReceiveNumericInput} />
          <div>
            {isExchangeSectionSubmittedError ? (
              <p className="text-red-600">You must first enter the amount you wish to withdraw</p>
            ) : (
              <></>
            )}
          </div>
          <div>
            {form.formState.isDirty && !tokenOutData.isLoading && tokenOutData.error && (
              <p className="text-red-600">{tokenOutData.error}</p>
            )}
          </div>
          <ExchangeRate {...{ tokenOutData, fromToken, toToken }} />
          <Collapse amount={tokenOutData.data?.amountOut.preciseString} currency={toToken?.assetCode} />
          <section className="w-full flex items-center justify-center mt-5">
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
          <SwapSubmitButton text={isExchangeSectionSubmitted ? 'Confirm' : 'Continue'} />
        </form>
      </main>
    </>
  );
};
