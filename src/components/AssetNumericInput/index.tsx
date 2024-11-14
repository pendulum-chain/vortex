import { FC } from 'preact/compat';
import { UseFormRegisterReturn } from 'react-hook-form';
import { AssetButton } from '../buttons/AssetButton';
import { SwapFormValues } from '../Nabla/schema';
import { NumericInput } from '../NumericInput';
import { AssetIconType } from '../../hooks/useGetIcon';

interface AssetNumericInputProps {
  assetIcon: AssetIconType;
  tokenSymbol: string;
  onClick: () => void;
  disabled?: boolean;
  readOnly?: boolean;
  registerInput: UseFormRegisterReturn<keyof SwapFormValues>;
  id: string;
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  assetIcon,
  tokenSymbol,
  onClick,
  registerInput,
  ...rest
}) => (
  <div
    className={
      'flex pl-2 focus:outline-none input-ghost text-accent-content' +
      (rest.disabled ? ' opacity-50 input-disabled' : '') +
      (rest.readOnly ? ' pr-4' : ' input-bordered input')
    }
  >
    <div className="flex items-center justify-between">
      <AssetButton assetIcon={assetIcon} tokenSymbol={tokenSymbol} onClick={onClick} />
    </div>

    <NumericInput
      register={registerInput}
      additionalStyle={'text-right text-lg w-full' + (rest.readOnly ? ' text-xl' : '')}
      disableStyles={true}
      {...rest}
    />
  </div>
);
