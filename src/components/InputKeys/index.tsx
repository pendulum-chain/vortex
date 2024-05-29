import React, { useState, useEffect, useCallback } from 'react';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from '../Nabla/BalanceState';
import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { Button, Card } from 'react-daisyui';
import { From } from './From';
import { PoolSelectorModal } from './SelectionModal';
import { FormProvider } from 'react-hook-form';
import { To } from './To';
import { useSwapForm } from '../Nabla/useSwapForm';
import { toBigNumber } from '../../helpers/parseNumbers';
import { Skeleton } from '../Skeleton';
import { Tabs } from 'react-daisyui';

const { RadioTab } = Tabs;
interface InputBoxProps {
  onSubmit: (
    userSubstrateAddress: string,
    swapsFirst: boolean,
    selectedAsset: string,
    swap: SwapOptions,
    maxBalanceFrom: number,
  ) => void;
  dAppName: string;
}

export interface SwapSettings {
  slippage?: number;
  deadline: number;
  from: string;
  to: string;
}

export interface SwapOptions {
  assetIn: string;
  assetOut: string;
  amountIn: number;
  minAmountOut: number;
  initialDesired: number;
}

function Loader() {
  return (
    <div className="flex justify-center items-center h-64">
      <Skeleton className="w-full max-w-8xl h-40" isLoading={true} text="Getting things ready..."></Skeleton>
    </div>
  );
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, dAppName }) => {
  const { walletAccount } = useGlobalState();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const [ss58Format, setSs58Format] = useState<number>(42);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);
  const [activeTab, setActiveTab] = useState<'swap' | 'direct'>('direct');

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
      setApi(api);
      setSs58Format(ss58Format);
    };

    initializeApiManager();
    setActiveTab('swap');
  }, []);

  useEffect(() => {
    if (activeTab === 'swap') {
      // force usdt selection
      onFromChange(TOKEN_CONFIG.usdt);
    } else {
      // removes possible usdt selected
      form.setValue('from', '');
    }
  }, [activeTab]);

  const wantsSwap = activeTab === 'swap';

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
    wantsSwap,
    api: api,
    walletAccount,
    fromAmount,
    fromToken: from,
    toToken: to,
    maximumFromAmount: undefined,
    slippage,
    form,
  });

  const handleSubmit = async () => {
    if (fromAmount === 0) {
      alert('Please enter an amount to offramp.');
      return;
    }

    let assetToOfframp;
    if (wantsSwap) {
      // ensure the swap was calculated and no errors were found
      if (inputHasErrors || tokenOutData.isLoading) {
        return;
      }
      assetToOfframp = to;
    } else {
      assetToOfframp = from;
    }

    if (!walletAccount?.address) {
      alert('Please connect to a wallet first.');
      return;
    }

    // check balance of the asset used to offramp directly or to pay for the swap
    if (balances[from].approximateNumber < fromAmount) {
      alert(
        `Insufficient balance to offramp. Current balance is ${
          balances[from].approximateNumber
        } ${from.toUpperCase()}.`,
      );
      return;
    }

    // If swap will happen, check the minimum comparing to the minimum expected swap
    const minWithdrawalAmountBigNumber = toBigNumber(
      TOKEN_CONFIG[assetToOfframp].minWithdrawalAmount!,
      TOKEN_CONFIG[assetToOfframp].decimals,
    );

    let minAmountOutBigNumber = toBigNumber('0', TOKEN_CONFIG[assetToOfframp].decimals);
    if (tokenOutData.data) {
      minAmountOutBigNumber = toBigNumber(tokenOutData.data.minAmountOut ?? '0', 0);
    }

    if (wantsSwap && assetToOfframp && minWithdrawalAmountBigNumber.gt(minAmountOutBigNumber)) {
      alert(`Insufficient balance to offramp. Minimum withdrawal amount for ${assetToOfframp} is not met.`);
      return;
    }

    let initialDesired = 0;
    if (tokenOutData.data) {
      initialDesired = tokenOutData.data.amountOut.approximateNumber;
    }

    setIsSubmitted(true);
    console.log(
      'submitting offramp',
      '\n',
      'user address: ',
      walletAccount.address,
      '\n',
      'wants swap: ',
      wantsSwap,
      '\n',
      'asset to offramp: ',
      assetToOfframp,
      '\n',
      'amount in: ',
      fromAmount,
      '\n',
      'asset in: ',
      from,
      '\n',
      'asset out: ',
      to,
      '\n',
      'min amount out: ',
      tokenOutData.data?.minAmountOut,
      '\n',
      'initial desired: ',
      tokenOutData.data?.amountOut.approximateNumber,
    );

    const maxBalanceFrom = balances[from].approximateNumber;

    onSubmit(
      walletAccount!.address,
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
  };

  // we don't propagate errors if wants swap is not defined
  const inputHasErrors = wantsSwap
    ? form.formState.errors.fromAmount?.message !== undefined || form.formState.errors.root?.message !== undefined
    : false;

  return (
    <div>
      <div className="icons">
        <img src={eurcSvg} className="icon" alt="EURC" />
        <img src={arrowSvg} className="arrow" alt="Arrow" />
        <img src={euroSvg} className="icon" alt="EURO" />
      </div>
      <div>
        <PoolSelectorModal
          open={!!modalType}
          // pass this to the modal. I get error when defining object here
          mode={{ type: modalType, swap: wantsSwap }}
          onSelect={modalType === 'from' ? onFromChange : onToChange}
          selected={{
            type: 'token',
            tokenAddress: modalType ? (modalType === 'from' ? fromToken?.assetCode : toToken?.assetCode) : undefined,
          }}
          onClose={() => setModalType(undefined)}
          isLoading={false}
        />
      </div>

      <div className={`inputBox ${isSubmitted ? 'active' : ''}`}>
        {!isSubmitted && (
          <div className="description">
            <ul>
              <li>Ensure to have enough token funds in Pendulum wallet (min. 10 Tokens)</li>
              <li>Do not close this window until the process is completed.</li>
              <li>This is a non-custodial prototype, please use at your own risk.</li>
            </ul>
          </div>
        )}
        <div>
          <OpenWallet dAppName={dAppName} ss58Format={ss58Format} offrampStarted={isSubmitted} />
        </div>
        <div className="text-center my-5">
          <Card.Title tag="h2" className="text-3xl font-normal">
            Offramp Asset
          </Card.Title>
        </div>

        <FormProvider {...form}>
        <Tabs variant="boxed" size="md">
          <RadioTab label="USDT Routed Offramp" checked={activeTab === "swap"}  onClick={() => setActiveTab("swap")}>
          <div className="input-container">
              {api === null || isBalanceLoading ? (
                <Loader />
              ) : (
                wantsSwap ? (  
              <Card bordered className="w-full max-w-xl bg-base-200 shadow-0">
                <From
                  offrampStarted={isSubmitted}
                  tokenId={from}
                  fromToken={fromToken}
                  onOpenSelector={() => setModalType('from')}
                  inputHasError={inputHasErrors}
                  form={form}
                  fromFormFieldName="fromAmount"
                  fromTokenBalances={balances}
                />
                <div>{tokenOutData.error && <p className="text-red-600">{tokenOutData.error}</p>}</div>
                <div className="separator mt-10 mb-10"></div>
                <To
                  tokenId={to}
                  fromTokenBalances={balances}
                  toToken={toToken}
                  fromToken={fromToken}
                  toAmountQuote={
                    inputHasErrors
                      ? { enabled: false, data: undefined, error: null, isLoading: false }
                      : tokenOutData
                  }
                  onOpenSelector={() => setModalType('to')}
                  fromAmount={fromAmount}
                  slippage={slippage}
                />
              </Card>
            ) : null
              )}
            </div>          
          </RadioTab>

          <RadioTab label="Direct Offramp" checked={activeTab === "direct"} onClick={() => setActiveTab("direct")}>
            <div className="input-container">
                  {api === null || isBalanceLoading ? (
                    <Loader />
                  ) : (
                    wantsSwap ? null : (  
                    <Card bordered className="w-full max-w-xl bg-base-200 shadow-0">
                      <From
                        offrampStarted={isSubmitted}
                        tokenId={from}
                        fromToken={fromToken}
                        onOpenSelector={() => setModalType('from')}
                        inputHasError={inputHasErrors}
                        form={form}
                        fromFormFieldName="fromAmount"
                        fromTokenBalances={balances}
                      />
                      <div>{tokenOutData.error && !tokenOutData.error.includes("missing") && <p className="text-red-600">{tokenOutData.error}</p>}</div>
                    </Card>
                    )
                  )}
                </div>  
          </RadioTab>

         </Tabs>
        </FormProvider>

        {!(from === '') && !isSubmitted && walletAccount?.address ? (
          <Button className="mt-10" size="md" color="primary" onClick={handleSubmit}>
            Prepare prototype
          </Button>
        ) : null}
        {isSubmitted && (
          <div className="offramp-started">
            Offramp started for asset - {to && wantsSwap ? to.toUpperCase() : from?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
};

export default InputBox;
