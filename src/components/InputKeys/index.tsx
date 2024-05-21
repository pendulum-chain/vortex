import React, { useState, useEffect, useCallback } from 'react';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from './BalanceState'; 
import { TOKEN_CONFIG, TokenDetails } from '../../constants/tokenConfig';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { Typography, Box } from '@material-ui/core';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
import { Button, Card } from 'react-daisyui';
import { From } from './From';
import { Resolver, useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { SwapFormValues } from './schema';
import schema from './schema';
import { storageService } from '../../services/localStorage';
import { getValidDeadline, getValidSlippage } from '../../helpers/transaction';
import { storageKeys } from '../../constants/localStorage';
import { config } from '../../config';
import { PoolSelectorModal } from './SelectionModal';
import BigNumber from 'bn.js';
import { debounce } from '../../helpers/function';
import { PoolEntry } from './SelectionModal';
import { FormProvider } from 'react-hook-form';
import { To } from './To';

interface InputBoxProps {
  onSubmit: (userSubstrateAddress: string, selectedAsset: string, swap: SwapOptions) => void;
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
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, dAppName }) => {
  const { walletAccount } = useGlobalState();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);
  const [secondSelectedAsset, setSecondSelectedAsset] = useState<string | null>(null);
  const [amount, setAmount] = useState<number>(0);

  const [expectedSwappedAmount, setExpectedSwappedAmount] = useState<{expectedSwap: number, fee: number} >({expectedSwap: 0, fee: 0}); 
  const [swapQueryError, setSwapQueryError] = useState<string | null>(null);
  const [swapQueryPending, setSwapQuertPending] = useState<boolean>(false);
  const [modalType, setModalType] = useState<string | undefined>(undefined);

  const [ss58Format, setSs58Format] = useState<number>(42);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [wantsSwap, setWantsSwap] = useState<boolean>(false);
  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);
  const tokensModal = useState<undefined | 'from' | 'to'>();
  const setTokenModal = tokensModal[1];

  const storageSet = debounce(storageService.set, 1000);

  const tokenOutData = useTokenOutAmount({
    api: api,
    walletAccount,
    fromAmount: amount, 
    fromToken: selectedAsset,
    toToken: secondSelectedAsset,
    maximumFromAmount: undefined,
    slippage: 0,
    setExpectedSwappedAmount, 
    setError: setSwapQueryError,
    setPending: setSwapQuertPending
  });

  const initialState: SwapFormValues =  {
      from:  '',
      toAmount: '0', 
      to: '',
      fromAmount: '0',
      slippage: 0,
      deadline:  config.swap.defaults.deadline
    }
   

  const form = useForm<SwapFormValues>({
    resolver: yupResolver(schema) as Resolver<SwapFormValues>,
    defaultValues: initialState,
  });

  const inputHasErrors = form.formState.errors.fromAmount?.message !== undefined || form.formState.errors.root?.message !== undefined;

  const control = form.control;
  const from = useWatch({ control, name: 'from' });
  const to = useWatch({ control, name: 'to' });

  const fromToken = from?  TOKEN_CONFIG[from] : undefined;
  const toToken = to? TOKEN_CONFIG[to]: undefined;

  const fromAmountString = useWatch({
    control,
    name: 'fromAmount',
    defaultValue: '0',
  });

  let fromAmount: BigNumber | undefined;
  try {
    fromAmount = new BigNumber(fromAmountString);
  } catch {
    fromAmount = undefined;
  }

  const slippage = getValidSlippage(
    Number(
      useWatch({
        control,
        name: 'slippage',
        defaultValue: config.swap.defaults.slippage,
      }),
    ),
  );


  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
      setApi(api);
      setSs58Format(ss58Format);
    };

    initializeApiManager();
  }, []);

  const handleSubmit = async () => {
    let assetToOfframp = secondSelectedAsset? secondSelectedAsset : selectedAsset;

    if (!walletAccount?.address) {
      alert('Please connect to a wallet first.');
      return;
    }

    // if (assetToOfframp && !balances[assetToOfframp].canWithdraw) {
    //   alert(`Insufficient balance to offramp. Minimum withdrawal amount for ${selectedAsset} is not met.`);
    //   return;
    // }

    setIsSubmitted(true);
    onSubmit(walletAccount.address, assetToOfframp!, {amountIn: amount, assetIn: selectedAsset!, assetOut: assetToOfframp!});
  };

  const updateStorage = useCallback(
    (newValues: Partial<SwapSettings>) => {
      const prev = form.getValues();
      const updated = {
        slippage: prev.slippage || config.swap.defaults.slippage,
        deadline: prev.deadline || config.swap.defaults.deadline,
        ...newValues,
      };
      storageSet(storageKeys.SWAP_SETTINGS, updated);
      return updated;
    },
    [form.getValues],
  );

  const onFromChange = useCallback(
    (a: TokenDetails | PoolEntry, event = true) => {
      const f = typeof a === 'string' ? a : a.assetCode;
      const prev = form.getValues();
      const tokenKey = Object.entries(TOKEN_CONFIG).filter(([key, tokenDetails])  => {
        return tokenDetails.assetCode === f;
      })[0][0];
      console.log(prev);
      const updated = {
        from: tokenKey,
        to: prev?.to === tokenKey ? prev?.from : prev?.to,
      };
      console.log(updated);
      updateStorage(updated);
      form.setValue('from', updated.from);
      setSelectedAsset(tokenKey);
      setAmount(0); // Reset amount when a new asset is selected

      setTokenModal(undefined);
    },
    [form.getValues, setTokenModal, form.setValue, updateStorage],
  );

  const onToChange = useCallback(
    (a: TokenDetails | PoolEntry, event = true) => {
      const f = typeof a === 'string' ? a : a.assetCode;
      const prev = form.getValues();
      const tokenKey = Object.entries(TOKEN_CONFIG).filter(([key, tokenDetails])  => {
        return tokenDetails.assetCode === f;
      })[0][0];
      console.log(prev);
      const updated = {
        to: tokenKey,
        from: prev?.from === tokenKey ? prev?.to : prev?.from,
      };
      updateStorage(updated);
      // if (updated.from && prev?.from !== updated.from) form.setValue('from', updated.from);
      form.setValue('to', updated.to);
      setSecondSelectedAsset(tokenKey);
    },
    [form.getValues, setTokenModal, form.setValue, updateStorage],
  );

  const getMaxAmountHint = (asset: string | null) => {
    return asset && balances[asset] ? `Max: ${balances[asset].approximateNumber}` : '';
  };

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
        <div className="input-container">
        <div>
        <FormProvider {...form}>
          <Card bordered className="w-full max-w-xl bg-base-200 shadow-0">
                <div className="flex justify-between mb-2">
                  <Card.Title tag="h2" className="text-3xl font-normal">
                    Offramp Asset
                  </Card.Title>
                </div>
                <From
                  tokenId={from}
                  fromToken={fromToken}
                  onOpenSelector={() => setModalType('from')}
                  inputHasError={inputHasErrors}
                  form={form}
                  fromFormFieldName="fromAmount"
                  fromTokenBalances={balances}
                />
                <div>
                    <button onClick={() => setWantsSwap(!wantsSwap)}>Swap to other asset before offramp</button>
                  </div>
                  <div>
                    {!canOfframpDirectly(selectedAsset) && (<p>Asset {selectedAsset} cannot be offramped directly, select the asset to swap to and offramp.</p>)}
                  </div>
                    {(!canOfframpDirectly(selectedAsset)  || wantsSwap )&& (
                        <div>
                          <To
                              toToken={toToken}
                              fromToken={fromToken}
                              toAmountQuote={
                                inputHasErrors ? { enabled: false, data: undefined, error: null, isLoading: false } : tokenOutData
                              }
                              onOpenSelector={() => setModalType('to')}
                              fromAmount={fromAmount}
                              slippage={slippage}
                            />
                      </div>
                    )}
          </Card>   
        </FormProvider>
      </div>
        </div>
        
        {selectedAsset && !isSubmitted && walletAccount?.address ? (
          <button className="begin-offramp-btn" onClick={handleSubmit}>Prepare prototype</button>
        ) : null}
        {isSubmitted && (
          <div className="offramp-started">
            Offramp started for asset - {secondSelectedAsset ? secondSelectedAsset.toUpperCase() : selectedAsset?.toUpperCase()}
          </div>
        )}
      </div>
    </div>
  );
};


//can withdraw directly function
const canOfframpDirectly = (asset: string | null) => {
  if (asset) {
    return TOKEN_CONFIG[asset].isOfframp;
  }

  // unselected asset does not matter here. We don't yet want to show the swap option.
  return true
}




export default InputBox;