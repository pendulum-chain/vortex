import React, { useState, useEffect } from 'react';
import { checkStellarAccount } from '../../services/stellar/utils';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider'; 
import {getApiManagerInstance, ApiManager} from '../../services/polkadot/polkadotApi'; 
import { useAccountBalance } from './BalanceState'
import {MIN_WITHDRAWAL_AMOUNT} from '../../constants/constants';
import {nativeToDecimal} from '../../helpers/parseNumbers';


interface InputBoxProps {
  onSubmit: (userSubstrateAddress: string) => void;
  dAppName: string;
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, dAppName }) => {
  const { walletAccount } = useGlobalState();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [stellarError, setStellarError] = useState<string>('');

  const [apiManager, setApiManager] = useState<ApiManager>();
  const [ss58Format, setSs58Format] = useState<number>(42);

  const { balance, isBalanceLoading, balanceError } = useAccountBalance(walletAccount?.address);


  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getApiManagerInstance(); 
      const { api, ss58Format } = await manager.getApi(); 
      setApiManager(manager);
      setSs58Format(ss58Format); 
    };

    initializeApiManager();
  }, []);

  const handleSubmit = async () => {
    if (!walletAccount?.address) {
      alert("Please connect to a wallet first.");
      return;
    }

    if (balance){
      if (Number(balance) < nativeToDecimal(MIN_WITHDRAWAL_AMOUNT).toNumber()){
        alert("Insufficient balance to offramp. Minimum withdrawal amount is 10 EURC.");
        return;
      }
    } 


    onSubmit(walletAccount.address);

  };

  return (
    <div>
          <div className="icons">
            <img src={eurcSvg} className="icon" alt="Icon X" />
            <img src={arrowSvg} className="arrow" alt="Arrow" />
            <img src={euroSvg} className="icon" alt="Icon Y" />
          </div>
          <div className={`inputBox ${isSubmitted ? 'active' : ''}`}>
            {!isSubmitted && (
              <div className="description">
                Connect your wallet to begin the process.
                <ul>
                  <li>Ensure to have enough EURC in Pendulum for the desired amount to offramp.</li>
                  <li>Do not close this window until the process is completed.</li>
                </ul>
              </div>
            )}
            {stellarError && <div style={{ color: 'red' }}>{stellarError}</div>}
            <div>
                <OpenWallet dAppName={dAppName} ss58Format={ss58Format} offrampStarted={isSubmitted} />
            </div>
            <div>
            { !walletAccount?.address ? (
              null
            ) : balanceError ? (
              <p>Error loading balance</p>
            ) : (
              <p>EURC Balance: {balance}</p>
            )}
            </div>  
            {!isSubmitted ? <button onClick={handleSubmit}>Begin Offramp</button> : <div>Offramp Started</div>}
          </div>
    </div>
  );
};

export default InputBox;
