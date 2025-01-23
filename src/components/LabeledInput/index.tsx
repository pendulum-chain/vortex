import { FC } from 'react';

interface LabeledInputProps {
  label: string;
  Input: ReactNode;
  htmlFor: string;
}

export const LabeledInput: FC<LabeledInputProps> = ({ label, Input, htmlFor }) => (
  <div>
    <label htmlFor={htmlFor}>
      <span className="font-thin">{label}</span>
    </label>
    {Input}
  </div>
);
