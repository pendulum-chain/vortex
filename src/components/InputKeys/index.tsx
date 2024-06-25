import React, { useState, useEffect } from 'react';
import { ConnectButton } from '@rainbow-me/rainbowkit';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import { useWagmiHooks } from '../../hooks/useWagmiHooks';
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

  useWagmiHooks();

  const { balances, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance();
      const { api, ss58Format } = await manager.getApiComponents();
    };

    initializeApiManager().catch(console.error);
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
            <ul>
              <li>Ensure to have enough token funds in Pendulum wallet (min. 10 Tokens)</li>
              <li>Do not close this window until the process is completed.</li>
              <li>This is a non-custodial prototype, please use at your own risk.</li>
            </ul>
          </div>
        )}
        <ConnectButton chainStatus="full" showBalance={true} accountStatus="address" label="Connect to Wallet" />
        <div className="button-container">
          {!isSubmitted && walletAccount?.address && (
            <>
              <div className="asset-selection-heading">Please select the asset to offramp:</div>
              {Object.entries(balances).map(([key, { balance, canWithdraw }]) => (
                <button
                  key={key}
                  className={`assetButton ${selectedAsset === key ? 'selected' : ''}`}
                  onClick={() => handleSelectAsset(key)}
                >
                  {key.toUpperCase()}
                </button>
              ))}
            </>
          )}
        </div>
        {!isSubmitted && selectedAsset && walletAccount?.address && (
          <div className="selected-balance-info">
            <p>Available Balance: {balances[selectedAsset].balance}</p>
          </div>
        )}

        {selectedAsset && !isSubmitted && walletAccount?.address ? (
          <button className="begin-offramp-btn" onClick={handleSubmit}>
            Prepare prototype
          </button>
        ) : null}
        {isSubmitted && (
          <div className="offramp-started">Offramp started for asset - {selectedAsset?.toUpperCase()}</div>
        )}
      </div>
    </div>
  );
};

export default InputBox;
