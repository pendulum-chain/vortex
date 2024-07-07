import React, { useState, useEffect, useCallback } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from '../Nabla/BalanceState';
import { TOKEN_CONFIG, TokenType } from '../../constants/tokenConfig';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { Button, Card } from 'react-daisyui';
import { Tabs } from 'react-daisyui';
import { From } from './From';
import { PoolSelectorModal } from './SelectionModal';
import { FormProvider } from 'react-hook-form';
import { To } from './To';
import { useSwapForm } from '../Nabla/useSwapForm';
import { toBigNumber } from '../../helpers/parseNumbers';
import { Skeleton } from '../Skeleton';
import { config } from '../../config';
import Big from 'big.js';
import { ExecutionInput } from '../../pages/landing';
import { useAccount, useSignMessage, useBalance } from 'wagmi';
import { useSquidRouterSwap } from '../../services/squidrouter';

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
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const { address } = useAccount();
  const { signMessage } = useSignMessage();
  const [api, setApi] = useState<ApiPromise | null>(null);
  const { balance, isBalanceLoading } = useAccountBalance(address);

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
      setApi(api);
    };

    initializeApiManager().catch(console.error);
  }, []);

  const wantsSwap = true;

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
    fromAmountString,
    fromToken: from,
    toToken: to,
    maximumFromAmount: undefined,
    xcmFees: config.xcm.fees,
    slippageBasisPoints: config.swap.slippageBasisPoints,
    form,
  });

  const {
    formState: { errors },
  } = form;

  const formErrorMessage = errors.fromAmount?.message ?? errors.root?.message;

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
      assetToOfframp = to as TokenType;
    } else {
      assetToOfframp = from as TokenType;
    }

    if (!address) {
      alert('Please connect to a wallet first.');
      return;
    }

    // check balance of the asset used to offramp directly or to pay for the swap
    if (balance.preciseBigDecimal.lt(fromAmount)) {
      alert(`Insufficient balance to offramp. Current balance is ${balance.approximateNumber} ${from.toUpperCase()}.`);
      return;
    }

    // If swap will happen, check the minimum comparing to the minimum expected swap
    const minWithdrawalAmountBigNumber = toBigNumber(
      TOKEN_CONFIG[assetToOfframp as TokenType].minWithdrawalAmount!,
      TOKEN_CONFIG[assetToOfframp as TokenType].decimals,
    );

    //TESTING
    // if (
    //   wantsSwap &&
    //   from &&
    //   tokenOutData.data !== undefined &&
    //   minWithdrawalAmountBigNumber.gt(tokenOutData.data.amountOut.preciseBigDecimal)
    // ) {
    //   alert(`Insufficient balance to offramp. Minimum withdrawal amount for ${assetToOfframp} is not met.`);
    //   return;
    // }

    setIsSubmitted(true);
    console.log(
      'submitting offramp',
      '\n',
      'user address: ',
      address,
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

    onSubmit({ assetToOfframp, amountIn: fromAmount, swapOptions });
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
        <ConnectButton chainStatus="full" showBalance={true} accountStatus="address" label="Connect to Wallet" />
        <div className="text-center my-5">
          <Card.Title tag="h2" className="text-3xl font-normal">
            Offramp Asset
          </Card.Title>
        </div>
        <FormProvider {...form}>
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
                  tokenBalance={balance}
                />
                <div>{formErrorMessage !== undefined && <p className="text-red-600">{formErrorMessage}</p>}</div>
                <div className="separator mt-10 mb-10"></div>
                <To
                  tokenId={to}
                  toToken={toToken}
                  fromToken={fromToken}
                  toAmountQuote={inputHasErrors ? { enabled: false, data: null, isLoading: false } : tokenOutData}
                  onOpenSelector={() => setModalType('to')}
                  fromAmount={fromAmount}
                />
              </Card>
            ) : null}
          </div>
        </FormProvider>

        {!(from === '') && !isSubmitted && address ? (
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
