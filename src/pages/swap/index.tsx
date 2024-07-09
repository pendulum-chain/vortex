import { ArrowDownIcon } from '@heroicons/react/20/solid';
import { useEffect, useState } from 'preact/hooks';
import { Navbar } from '../../components/Navbar';
import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { Collapse } from '../../components/Collapse';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { BalanceInfo, useAccountBalance } from '../../components/Nabla/BalanceState';

import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { BankDetails } from './sections/BankDetails';
import { ExchangeRate } from '../../components/ExchangeRate';
import { AssetNumericInput } from '../../components/AssetNumericInput';
import { WalletAccount } from '@talismn/connect-wallets';
import { toBigNumber } from '../../helpers/parseNumbers';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { SwapOptions } from '../../components/InputKeys';

interface SubmitForm {
  fromAmount: number;
  walletAccount: WalletAccount;
  balances: {
    [key: string]: BalanceInfo;
  };
  onSubmit: (
    userSubstrateAddress: string,
    swapsFirst: boolean,
    selectedAsset: string,
    swap: SwapOptions,
    maxBalanceFrom: number,
  ) => void;
}

function submitForm({ fromAmount, walletAccount, balances, from, tokenOutData, onSubmit }: SubmitForm) {
  if (fromAmount === 0) {
    return new Error('Please enter an amount to offramp.');
  }

  if (walletAccount?.address) {
    return new Error('Please connect wallet first.');
  }

  // check balance of the asset used to offramp directly or to pay for the swap
  if (balances[from].approximateNumber < fromAmount) {
    return new Error(
      `Insufficient balance to offramp. Current balance is ${balances[from].approximateNumber} ${from.toUpperCase()}.`,
    );
  }

  const assetToOfframp = from;

  // If swap will happen, check the minimum comparing to the minimum expected swap
  const minWithdrawalAmountBigNumber = toBigNumber(
    TOKEN_CONFIG[assetToOfframp].minWithdrawalAmount,
    TOKEN_CONFIG[assetToOfframp].decimals,
  );

  let minAmountOutBigNumber = toBigNumber('0', TOKEN_CONFIG[assetToOfframp].decimals);

  if (tokenOutData.data) {
    minAmountOutBigNumber = toBigNumber(tokenOutData.data.minAmountOut ?? '0', 0);
  }

  if (assetToOfframp && minWithdrawalAmountBigNumber.gt(minAmountOutBigNumber)) {
    return new Error(`Insufficient balance to offramp. Minimum withdrawal amount for ${assetToOfframp} is not met.`);
  }

  const initialDesired = tokenOutData.data.amountOut.approximateNumber;

  setIsSubmitted(true);

  const maxBalanceFrom = balances[from].approximateNumber;

  onSubmit(
    walletAccount.address,
    wantsSwap,
    assetToOfframp,
    {
      amountIn: fromAmount,
      assetIn: from,
      assetOut: to,
      minAmountOut: minAmountOutBigNumber.toNumber(),
      initialDesired,
    },
    maxBalanceFrom,
  );
}

const Arrow = () => (
  <div className="w-full flex justify-center my-5">
    <ArrowDownIcon className="w-7 text-blue-700" />
  </div>
);

export const Swap = () => {
  const [isExchangeSectionSubmitted, setIsExchangeSectionSubmitted] = useState(false);
  const [isExchangeSectionSubmittedError, setIsExchangeSectionSubmittedError] = useState(false);

  const walletAccount: { address: string; source: string } = { address: '', source: '' };
  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);
  const [api, setApi] = useState<ApiPromise | null>(null);

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
  } = useSwapForm();

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
    const toAmount = Number(tokenOutData.data?.amountOut.preciseString);
    form.setValue('toAmount', isNaN(toAmount) ? '0' : toAmount.toFixed(2));
  }, [form, fromAmount, tokenOutData]);

  const ReceiveNumericInput = () => (
    <AssetNumericInput
      additionalText="PIX / Bank Account"
      fromToken={toToken}
      onClick={() => setModalType('to')}
      registerInput={form.register('toAmount')}
      disabled={tokenOutData.isLoading}
      readOnly={true}
    />
  );

  const WidthrawNumericInput = () => (
    <AssetNumericInput
      additionalText="Polygon"
      registerInput={form.register('fromAmount')}
      fromToken={fromToken}
      onClick={() => setModalType('from')}
    />
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
      <main className="flex justify-center items-center mt-12">
        <form
          className="shadow-custom px-4 py-8 rounded-lg mb-12 mx-8 md:mx-auto w-full md:w-2/3 lg:w-3/5 xl:w-1/2 max-w-2xl"
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
          <div>{tokenOutData.error && <p className="text-red-600">{tokenOutData.error}</p>}</div>
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
          <button className="btn rounded-xl bg-blue-700 text-white w-full mt-5">
            {isExchangeSectionSubmitted ? 'Confirm' : 'Continue'}
          </button>
        </form>
      </main>
    </>
  );
};
