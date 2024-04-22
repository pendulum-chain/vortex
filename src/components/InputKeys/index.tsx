import React, { useState, useEffect } from 'react';
import { checkStellarAccount } from '../../services/stellar/utils';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
import OpenWallet from '../Wallet';
import { useGlobalState } from '../../GlobalStateProvider'; 
import {getInstance, ApiManager} from '../../services/polkadot/polkadotApi'; 
export interface IInputBoxData {
  stellarFundingSecret: string;
  pendulumSecret: string;
}

interface InputBoxProps {
  onSubmit: (secrets: IInputBoxData) => void;
  dAppName: string;
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit, dAppName }) => {
  const [stellarFundingSecret, setStellarFundingSecret] = useState<string>('');
  const { walletAccount } = useGlobalState();
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);
  const [stellarError, setStellarError] = useState<string>('');

  const [apiManager, setApiManager] = useState<ApiManager>();
  const [ss58Format, setSs58Format] = useState<number>(42);

  

  useEffect(() => {
    const initializeApiManager = async () => {
      const manager = await getInstance(); 
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

    const stellarResult = await checkStellarAccount(stellarFundingSecret);
    if (stellarResult) {
      setIsSubmitted(true);
      onSubmit({ stellarFundingSecret, pendulumSecret: walletAccount.address });
    } else {
      setStellarError('Please check the stellar secret');
    }
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
                Enter your Stellar secret below to start the offramp process.
                <ul>
                  <li>Ensure to have enough EURC in Pendulum for the desired amount to offramp.</li>
                  <li>Do not close this window until the process is completed.</li>
                </ul>
              </div>
            )}
            <input
              type="password"
              value={stellarFundingSecret}
              onChange={(e) => {
                setStellarFundingSecret((e.target as HTMLInputElement).value);
                if (stellarError) setStellarError('');
              }}
              placeholder="Stellar Funding Secret"
              disabled={isSubmitted}
            />
            {stellarError && <div style={{ color: 'red' }}>{stellarError}</div>}
            <div>
                <OpenWallet dAppName={dAppName} ss58Format={ss58Format} offrampStarted={isSubmitted} />
              </div>

            {!isSubmitted ? <button onClick={handleSubmit}>Begin Offramp</button> : <div>Offramp Started</div>}
          </div>
    </div>
  );
};

export default InputBox;
