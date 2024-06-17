import React, { useState, useEffect } from 'react';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from '../Nabla/BalanceState';
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
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
import { config } from '../../config';
import Big from 'big.js';
import { ExecutionInput } from '../../pages/landing';

const { RadioTab } = Tabs;
interface InputBoxProps {
  onSubmit: (input: ExecutionInput) => void;
  dAppName: string;
}

export interface SwapSettings {
  from: string;
  to: string;
}

export interface SwapOptions {
  assetIn: string;
  minAmountOut: Big;
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
  const { balances, isBalanceLoading } = useAccountBalance(walletAccount?.address);
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

  const wantsSwap = activeTab === 'swap';

  const {
    tokensModal: [modalType, setModalType],
    onFromChange,
    onToChange,
    form,
    fromAmount,
    fromAmountString,
    fromToken,
    toToken,
    from,
    to,
  } = useSwapForm();

  const tokenOutData = useTokenOutAmount({
    wantsSwap,
    api: api,
    walletAccount,
    fromAmountString,
    fromToken: from,
    toToken: to,
    maximumFromAmount: undefined,
    slippageBasisPoints: config.swap.slippageBasicPoints,
    form,
  });

  const {
    setValue,
    formState: { errors },
  } = form;

  const formErrorMessage = errors.fromAmount?.message ?? errors.root?.message;

  useEffect(() => {
    if (activeTab === 'swap') {
      // force usdt selection
      onFromChange(TOKEN_CONFIG.usdt);
    } else {
      // removes possible usdt selected
      setValue('from', '');
    }
  }, [activeTab, setValue, onFromChange]);

  const handleSubmit = async () => {
    if (fromAmount === undefined || fromAmount.eq(0)) {
      alert('Please enter an amount to offramp.');
      return;
    }

    if (tokenOutData.data === null) return;

    let assetToOfframp;
    let swapOptions: SwapOptions | undefined;
    if (wantsSwap) {
      // ensure the swap was calculated and no errors were found
      if (inputHasErrors || tokenOutData.isLoading || tokenOutData.data === undefined) {
        return;
      }

      swapOptions = {
        assetIn: from,
        minAmountOut: tokenOutData.data.amountOut.preciseBigDecimal,
      };
      assetToOfframp = to;
    } else {
      assetToOfframp = from;
    }

    if (!walletAccount?.address) {
      alert('Please connect to a wallet first.');
      return;
    }

    // check balance of the asset used to offramp directly or to pay for the swap
    console.log('balances', balances);
    if (balances[from].preciseBigDecimal.lt(fromAmount)) {
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

    if (
      wantsSwap &&
      from &&
      tokenOutData.data !== undefined &&
      minWithdrawalAmountBigNumber.gt(tokenOutData.data.amountOut.preciseBigDecimal)
    ) {
      alert(`Insufficient balance to offramp. Minimum withdrawal amount for ${assetToOfframp} is not met.`);
      return;
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
      'initial desired: ',
      tokenOutData.data?.amountOut.approximateNumber,
    );

    onSubmit({ userSubstrateAddress: walletAccount!.address, assetToOfframp, amountIn: fromAmount, swapOptions });
  };

  // we don't propagate errors if wants swap is not defined
  const inputHasErrors = wantsSwap && formErrorMessage !== undefined;

  return (
    <div>
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
              <li>
                Ensure to have enough token funds in Pendulum wallet{' '}
                {toToken &&
                  toToken.minWithdrawalAmount &&
                  `(min. ${BigInt(toToken.minWithdrawalAmount) / 10n ** BigInt(toToken.decimals)} ${
                    toToken.assetCode
                  })`}
              </li>
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
            <RadioTab label="USDT Routed Offramp" checked={activeTab === 'swap'} onClick={() => setActiveTab('swap')}>
              <div className="input-container">
                {api === null || isBalanceLoading ? (
                  <Loader />
                ) : wantsSwap ? (
                  <Card bordered className="w-full max-w-xl bg-base-200 shadow-0">
                    <From
                      offrampStarted={isSubmitted}
                      tokenId={from}
                      fromToken={fromToken}
                      onOpenSelector={() => setModalType('from')}
                      inputHasError={inputHasErrors}
                      form={form}
                      fromFormFieldName="fromAmount"
                      tokenBalances={balances}
                    />
                    <div>{formErrorMessage !== undefined && <p className="text-red-600">{formErrorMessage}</p>}</div>
                    <div className="separator mt-10 mb-10"></div>
                    <To
                      tokenId={to}
                      tokenBalances={balances}
                      toToken={toToken}
                      fromToken={fromToken}
                      toAmountQuote={inputHasErrors ? { enabled: false, data: null, isLoading: false } : tokenOutData}
                      onOpenSelector={() => setModalType('to')}
                      fromAmount={fromAmount}
                    />
                  </Card>
                ) : null}
              </div>
            </RadioTab>

            <RadioTab label="Direct Offramp" checked={activeTab === 'direct'} onClick={() => setActiveTab('direct')}>
              <div className="input-container">
                {api === null || isBalanceLoading ? (
                  <Loader />
                ) : wantsSwap ? null : (
                  <Card bordered className="w-full max-w-xl bg-base-200 shadow-0">
                    <From
                      offrampStarted={isSubmitted}
                      tokenId={from}
                      fromToken={fromToken}
                      onOpenSelector={() => setModalType('from')}
                      inputHasError={inputHasErrors}
                      form={form}
                      fromFormFieldName="fromAmount"
                      tokenBalances={balances}
                    />
                  </Card>
                )}
              </div>
            </RadioTab>
          </Tabs>
        </FormProvider>

        {!(from === '') && !isSubmitted && walletAccount?.address ? (
          <Button className="mt-10" size="md" color="primary" onClick={handleSubmit} disabled={inputHasErrors}>
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
