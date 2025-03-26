import { ChangeEvent, FC } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';
import { AssetButton } from '../buttons/AssetButton';
import { SwapFormValues } from '../Nabla/schema';
import { NumericInput } from '../NumericInput';
import { AssetIconType } from '../../hooks/useGetAssetIcon';

interface AssetNumericInputProps {
  assetIcon: AssetIconType;
  tokenSymbol: string;
  onClick: () => void;
  onChange?: (e: ChangeEvent) => void;
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
    aria-readonly={rest.readOnly}
    className={
      'flex pl-2 py-1 mb-2 mt-1 items-center ' +
      (rest.disabled ? ' opacity-50 input-disabled ' : '') +
      (rest.readOnly ? ' pr-0.5' : 'input-vortex-primary border-1 border-neutral-300 w-full input input-ghost ')
    }
  >
    <div className="flex items-center">
      <AssetButton disabled={rest.disabled} assetIcon={assetIcon} tokenSymbol={tokenSymbol} onClick={onClick} />
    </div>

    <NumericInput
      register={registerInput}
      additionalStyle={'text-right text-lg ' + (rest.readOnly ? ' text-xl' : '')}
      {...rest}
    />
  </div>
);
