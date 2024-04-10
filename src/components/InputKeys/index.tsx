import React, { useState } from 'react';

export interface InputBoxEvent{
    inputOne: string;
    inputTwo: string;
}

interface InputBoxProps {
  onStart: (eventData: InputBoxEvent) => void;
  onSubmit: (eventData: InputBoxEvent) => void;
}

const InputBox: React.FC<InputBoxProps> = ({ onStart, onSubmit }) => {
  const [inputOne, setInputOne] = useState<string>('');
  const [inputTwo, setInputTwo] = useState<string>('');

  const handleSubmit = () => {
    onSubmit({ inputOne, inputTwo });
  };

  return (
    <div className="inputBox">
        <input
            type="text"
            value={inputOne}
            onChange={(e) => setInputOne((e.target as HTMLInputElement).value)}
            placeholder="Input One"
        />
        <input
            type="text"
            value={inputTwo}
            onChange={(e) => setInputTwo((e.target as HTMLInputElement).value)}
            placeholder="Input Two"
        />
        <button onClick={handleSubmit}>Start</button>
    </div>
  );
}

export default InputBox;
