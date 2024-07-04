import { ArrowDownIcon, ChevronDownIcon } from '@heroicons/react/20/solid';
import { useForm } from 'react-hook-form';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { Navbar } from '../../components/Navbar';
import { NumericInput } from '../../components/NumericInput';
import { LabeledInput } from '../../components/LabeledInput';
import { BenefitsList } from '../../components/BenefitsList';
import { Collapse } from '../../components/Collapse';
import { useSwapForm } from '../../components/Nabla/useSwapForm';
import { useAccountBalance } from '../../components/Nabla/BalanceState';

import { ApiPromise, getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { AssetSelector } from '../../components/AssetSelector';
import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { PoolSelectorModal } from '../../components/InputKeys/SelectionModal';
import { getIcon } from '../../shared/getIcon';

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

  const poolList = useMemo(() => {
    const poolList: TokenDetails[] = [];
    Object.keys(TOKEN_CONFIG).forEach((token) => {
      // special case rules
      //   // do not allow non-offramp tokens in the to field,
      //   if (mode.type === 'to' && mode.swap && !TOKEN_CONFIG[token].isOfframp) return;

      //   // only allow USDT asset code
      //   if (mode.type === 'from' && mode.swap && TOKEN_CONFIG[token].assetCode !== 'USDT') return;

      //   // Do not allow non offrampable tokens in the from field if no swap
      //   if (mode.type === 'from' && !mode.swap && !TOKEN_CONFIG[token].isOfframp) return;

      poolList.push(TOKEN_CONFIG[token]);
    });

    return poolList;
  }, []);

  const OpenPoolListModalButton = ({ tag }: { tag: 'from' | 'to' }) => (
    <button
      className="hover:bg-blue-200 absolute translate-y-1/2 bottom-1/2 left-2 rounded-full min-h-none h-8 flex items-center mt-0.5 border border-blue-700 px-2 py-1 pr-3"
      onClick={() => setModalType(tag)}
      type="button"
    >
      <span className="rounded-full h-full p-px mr-1">
        {fromToken && (
          <img src={getIcon(fromToken.assetCode.toUpperCase())} alt={fromToken.assetCode} className="h-full w-auto" />
        )}
      </span>
      <strong className="font-bold text-black">{fromToken?.assetCode || 'Select'}</strong>
    </button>
  );

  const WidthrawNumericInput = () => (
    <div className="relative">
      <OpenPoolListModalButton tag="from" />
      <NumericInput register={register('withdraw')} />
    </div>
  );
  const ReceiveNumericInput = () => (
    <div className="relative">
      <OpenPoolListModalButton tag="to" />
      <NumericInput register={register('receive')} />
    </div>
  );

  const Arrow = () => (
    <div className="w-full flex justify-center my-5">
      <button>
        <ArrowDownIcon className="w-7 text-blue-700" />
      </button>
    </div>
  );

  const ExchangeRate = () => (
    <p className="font-thin text-center my-5">
      {fromToken !== undefined &&
      toToken !== undefined &&
      !tokenOutData.isLoading &&
      tokenOutData.data !== undefined ? (
        <>{`1 ${fromToken.assetCode} = ${tokenOutData.data.effectiveExchangeRate} ${toToken.assetCode}`}</>
      ) : (
        `-`
      )}
    </p>
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
        <form className="shadow-custom px-4 py-8 w-1/2 rounded-lg">
          <h1 className="text-3xl text-blue-700 font-bold text-center mb-5">Withdraw</h1>
          <LabeledInput label="You withdraw" Input={WidthrawNumericInput} />
          <Arrow />
          <LabeledInput label="You receive" Input={ReceiveNumericInput} />
          <div>{tokenOutData.error && <p className="text-red-600">{tokenOutData.error}</p>}</div>
          <ExchangeRate />
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
