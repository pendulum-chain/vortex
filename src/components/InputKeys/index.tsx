import React, { useState } from 'react';

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

  const handleSubmit = () => {
    onSubmit({ stellarFundingSecret, pendulumSecret });
  };

  return (
    <div className="inputBox">
        <input
            type="text"
            value={stellarFundingSecret}
            onChange={(e) => setStellarFundingSecret((e.target as HTMLInputElement).value)}
            placeholder="Stellar Funding Secret"
        />
        <input
            type="text"
            value={pendulumSecret}
            onChange={(e) => setPendulumSecret((e.target as HTMLInputElement).value)}
            placeholder="Pendulum Secret"
        />
        <button onClick={handleSubmit}>Start</button>
    </div>
  );
}

export default InputBox;
