import { ArrowDownIcon } from '@heroicons/react/20/solid';
import { useForm } from 'react-hook-form';
import { useEffect, useState } from 'preact/hooks';
import { Navbar } from '../../components/Navbar';
import { NumericInput } from '../../components/NumericInput';
import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { Collapse } from '../../components/Collapse';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { useSwapForm } from '../../components/Nabla/useSwapForm';

import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from '../../components/Nabla/BalanceState';

export const Swap = () => {
  const walletAccount: { address: string; source: string } = { address: '', source: '' };
  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { register } = useForm();

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
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

  const WidthrawNumericInput = () => <NumericInput register={register('withdraw')} />;
  const ReceiveNumericInput = () => <NumericInput register={register('receive')} />;

  const Arrow = () => (
    <div className="w-full flex justify-center my-5">
      <button>
        <ArrowDownIcon className="w-7 text-blue-700" />
      </button>
    </div>
  );

  return (
    <>
      <Navbar />
      <main className="flex justify-center items-center mt-12">
        <form className="shadow-custom px-4 py-8 w-1/2 rounded-lg">
          <h1 className="text-3xl text-blue-700 font-bold text-center mb-5">Withdraw</h1>
          <LabeledInput label="You withdraw" Input={WidthrawNumericInput} />
          <Arrow />
          <LabeledInput label="You receive" Input={ReceiveNumericInput} />
          <div>{tokenOutData.error && <p className="text-red-600">{tokenOutData.error}</p>}</div>
          <p className="font-thin text-center my-5">1 USDC = 5.5264 BRL</p>
          <Collapse />
          <section className="w-full flex items-center justify-center mt-5">
            <BenefitsList />
          </section>
          <button className="btn rounded-xl bg-blue-700 text-white w-full mt-5">Connect Wallet</button>
        </form>
      </main>
    </>
  );
};
