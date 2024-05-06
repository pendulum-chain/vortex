import React, { useState, useEffect } from 'react';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider';
import { getApiManagerInstance } from '../../services/polkadot/polkadotApi';
import { useAccountBalance } from './BalanceState'; 

interface InputBoxProps {
  onSubmit: (userSubstrateAddress: string, selectedAsset: string) => void;
  dAppName: string;
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, dAppName }) => {
  const { walletAccount } = useGlobalState();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [selectedAsset, setSelectedAsset] = useState<string | null>(null);

  const [ss58Format, setSs58Format] = useState<number>(42);

  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
      setSs58Format(ss58Format);
    };

    initializeApiManager();
  }, []);

  const handleSelectAsset = (asset: string) => {
    setSelectedAsset(asset);
  };

  const handleSubmit = async () => {
    if (!walletAccount?.address) {
      alert('Please connect to a wallet first.');
      return;
    }

    if (selectedAsset && !balances[selectedAsset].canWithdraw) {
      alert(`Insufficient balance to offramp. Minimum withdrawal amount for ${selectedAsset} is not met.`);
      return;
    }
    setIsSubmitted(true);
    onSubmit(walletAccount.address, selectedAsset!);
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
            Enter your Stellar secret below to start the offramp process.
            <ul>
              <li>Ensure to have enough funds in your wallet for the desired amount to offramp.</li>
              <li>Do not close this window until the process is completed.</li>
            </ul>
          </div>
        )}
      <div>
          <OpenWallet dAppName={dAppName} ss58Format={ss58Format} offrampStarted={isSubmitted} />
      </div>
      <div className="button-container">
        {!isSubmitted && walletAccount?.address && (
          <>
            <div className="asset-selection-heading">Please select the asset to offramp:</div>
            {Object.entries(balances).map(([key, { balance, canWithdraw }]) => (
              <button key={key} className={`assetButton ${selectedAsset === key ? 'selected' : ''}`}
                      disabled={!canWithdraw} onClick={() => handleSelectAsset(key)}>
                {key.toUpperCase()}
              </button>
            ))}
          </>
        )}
      </div>
        {!isSubmitted && selectedAsset && walletAccount?.address && (
          <div className="selected-balance-info">
            <p>Selected Asset: {selectedAsset.toUpperCase()}</p>
            <p>Available Balance: {balances[selectedAsset].balance}</p>
          </div>
        )}
        
          {selectedAsset && !isSubmitted && walletAccount?.address ? <button className="begin-offramp-btn" onClick={handleSubmit}>Begin {selectedAsset.toUpperCase()} Offramp</button> : null}
          {isSubmitted && (
            <div className="offramp-started">
              Offramp started for asset - {selectedAsset?.toUpperCase()}
            </div>
          )}
        
      </div>
    </div>
  );
};

export default InputBox;
