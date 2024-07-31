import { FC } from 'preact/compat';

interface LabeledInputProps {
  label: string;
  Input: ReactNode;
}

export const LabeledInput: FC<LabeledInputProps> = ({ label, Input }) => (
  <label>
    <span className="font-thin">{label}</span>
    {Input}
  </label>
);
