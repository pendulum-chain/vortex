import React, { useState } from 'react';
import { checkStellarAccount } from '../../services/stellar/utils';
import { checkPendulumAccount } from '../../services/polkadot/utils';
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
    <div className="inputBox">
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
      {!isSubmitted && <button onClick={handleSubmit}>Start</button>}
      {isSubmitted && <div>Started</div>}
    </div>
  );

}

export default InputBox;