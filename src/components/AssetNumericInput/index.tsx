import { FC } from 'preact/compat';
import { UseFormRegisterReturn } from 'react-hook-form';
import { TokenDetails } from '../../constants/tokenConfig';
import { AssetButton } from '../buttons/AssetButton';
import { SwapFormValues } from '../Nabla/schema';
import { NumericInput } from '../NumericInput';

interface AssetNumericInputProps {
  fromToken?: TokenDetails;
  onClick: () => void;
  additionalText: string;
  registerInput: UseFormRegisterReturn<keyof SwapFormValues>;
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  additionalText,
  fromToken,
  onClick,
  registerInput,
  ...rest
}) => (
  <div className="relative hover:cursor-pointer">
    <AssetButton token={fromToken} onClick={onClick} />
    <p className="text-blue-700 text-sm absolute translate-y-1/2 bottom-1/2 left-28">{additionalText}</p>
    <NumericInput register={registerInput} additionalStyle="text-right text-lg" {...rest} />
  </div>
);
