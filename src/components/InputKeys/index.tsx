import React, { useState } from 'react';
import { checkStellarAccount } from '../../services/stellar/utils';
import { checkPendulumAccount } from '../../services/polkadot/utils';
import eurcSvg from '../../assets/coins/eurc.svg';
import euroSvg from '../../assets/coins/euro.svg';
import arrowSvg from '../../assets/coins/arrow.svg';
export interface IInputBoxData{
    stellarFundingSecret: string;
    pendulumSecret: string;
}

interface InputBoxProps {
  onSubmit: (secrets: IInputBoxData) => void;
}

const InputBox: React.FC<InputBoxProps> = ({ onSubmit }) => {
  const [stellarFundingSecret, setStellarFundingSecret] = useState<string>('');
  const [pendulumSecret, setPendulumSecret] = useState<string>('');
  const [isSubmitted, setIsSubmitted] = useState<boolean>(false);

  const [stellarError, setStellarError] = useState<string>('');
  const [pendulumError, setPendulumError] = useState<string>('');

  const handleSubmit = async () => {
    const stellarResult = await checkStellarAccount(stellarFundingSecret);
    
    const pendulumResult =  await checkPendulumAccount(pendulumSecret) 
    
    if (stellarResult && pendulumResult) {
      setIsSubmitted(true);
      onSubmit({ stellarFundingSecret, pendulumSecret });
    } else {
      if (!stellarResult) {
        setStellarError("Please check the stellar secret");
      }
      if (!pendulumResult) {
        setPendulumError("Please check the pendulum secret");
      }
      console.error("One or both accounts do not exist or have insufficient balance.");
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
        {!isSubmitted && <div className="description">
        Enter your secrets below to start the offramp process.
        <ul>
          <li>Ensure to have enough EURC in Pendulum for the desired amount to offramp.</li>
          <li>Do not close this window until the process is completed.</li>
        </ul>
        
      </div>
        }
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
        {stellarError && <div style={{color: 'red'}}>{stellarError}</div>}
        <input
          type="password"
          value={pendulumSecret}
          onChange={(e) => {
            setPendulumSecret((e.target as HTMLInputElement).value);
            if (pendulumError) setPendulumError(''); 
          }}
          placeholder="Pendulum Secret"
          disabled={isSubmitted}
        />
        {pendulumError && <div style={{color: 'red'}}>{pendulumError}</div>}
        {!isSubmitted ? <button onClick={handleSubmit}>Begin Offramp</button> : <div>Started</div>}
      </div>
    </div>
  )

}

export default InputBox;