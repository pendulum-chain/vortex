import React, { useState, useEffect } from 'react';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from './BalanceState'; 
import { TOKEN_CONFIG } from '../../constants/tokenConfig';
import { useTokenOutAmount } from '../../hooks/nabla/useTokenAmountOut';
import { Typography, Box } from '@material-ui/core';
import { ApiPromise } from '../../services/polkadot/polkadotApi';
interface InputBoxProps {
  onSubmit: (userSubstrateAddress: string, selectedAsset: string, swap: SwapOptions) => void;
  dAppName: string;
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

  const [ss58Format, setSs58Format] = useState<number>(42);
  const [api, setApi] = useState<ApiPromise | null>(null);
  const [wantsSwap, setWantsSwap] = useState<boolean>(false);
  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);


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
  
  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
      setApi(api);
      setSs58Format(ss58Format);
    };

    initializeApiManager();
  }, []);

  const handleSelectAsset = (e: any) => {
    setSelectedAsset(e.target.value);
    setAmount(0); // Reset amount when a new asset is selected
  };

  const handleSelectSecondAsset = (e: any) => {
    let targetToken = e.target.value;
    setSecondSelectedAsset(targetToken);
  };

  const handleAmountChange = (e: any) => {
    // empty string is ignored
    if (e.target.value === '') {
      setAmount(0);
      return;
    }
    // try to parse float, otherwise ignore
    if (isNaN(parseFloat(e.target.value))) {
      return;
    }
    setAmount(parseFloat(e.target.value));
  };

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

  const getMaxAmountHint = (asset: string | null) => {
    return asset && balances[asset] ? `Max: ${balances[asset].balance}` : '';
  };

  return (
    <div>
      <div className="icons">
        <img src={eurcSvg} className="icon" alt="EURC" />
        <img src={arrowSvg} className="arrow" alt="Arrow" />
        <img src={euroSvg} className="icon" alt="EURO" />
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
          <input
            type="number"
            placeholder={getMaxAmountHint(selectedAsset)}
            value={amount ?? ''}
            onChange={(e) => handleAmountChange(e as React.ChangeEvent<HTMLInputElement>)}
            disabled={!selectedAsset}
          />
          <select onChange={(e) => handleSelectAsset(e)} value={selectedAsset || ''}>
            <option value="" disabled>Select an asset</option>
            {Object.keys(balances).map((key) => (
              <option key={key} value={key}>
                {key.toUpperCase()}
              </option>
            ))}
          </select>
        </div>
        <div>
          <button onClick={() => setWantsSwap(!wantsSwap)}>Swap to other asset before offramp</button>
        </div>
        <div>
            {!canOfframpDirectly(selectedAsset) && (<p>Asset {selectedAsset} cannot be offramped directly, select the asset to swap to and offramp.</p>)}
          </div>
        {(!canOfframpDirectly(selectedAsset)  || wantsSwap )&& (
          <div>
            <div className="input-container">
            {!swapQueryPending? (
                <Box display="flex" flexDirection="column" p={2}>
                  <Typography variant="h6">
                    Offramp value is: {expectedSwappedAmount.expectedSwap}
                  </Typography>
                  <Typography variant="body2" style={{ marginTop: 8 }}>
                    Expected fee is: {expectedSwappedAmount.fee}
                  </Typography>
              </Box>
              ): null}
              <select onChange={(e) => handleSelectSecondAsset(e)} value={secondSelectedAsset || ''}>
                <option value="" disabled>Select an asset</option>
                {TOKEN_CONFIG[selectedAsset!].canSwapTo.map((key) => (
                  <option key={key} value={key}>
                    {key.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
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