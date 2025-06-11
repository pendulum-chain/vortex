import { ChangeEvent, FC } from 'react';
import { UseFormRegisterReturn } from 'react-hook-form';
import { cn } from '../../helpers/cn';
import { RampFormValues } from '../../hooks/ramp/schema';
import { NumericInput } from '../NumericInput';
import { AssetButton } from '../buttons/AssetButton';

interface AssetNumericInputProps {
  assetIcon: string;
  tokenSymbol: string;
  onClick: () => void;
  onChange?: (e: ChangeEvent) => void;
  disabled?: boolean;
  readOnly?: boolean;
  loading?: boolean;
  registerInput: UseFormRegisterReturn<keyof RampFormValues>;
  id: string;
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  assetIcon,
  tokenSymbol,
  onClick,
  registerInput,
  loading,
  ...rest
}) => (
  <div
    aria-readonly={rest.readOnly}
    className={cn(
      'flex pl-2 py-1 mb-2 mt-1 items-center',
      rest.readOnly ? 'pr-0.5' : 'input-vortex-primary border-1 border-neutral-300 w-full input input-ghost',
    )}
  >
    <div className="flex items-center">
      <AssetButton assetIcon={assetIcon} tokenSymbol={tokenSymbol} onClick={onClick} />
    </div>

    {loading ? (
      <div className="loading loading-bars loading-md ml-auto mr-4"></div>
    ) : (
      <NumericInput
        loading={loading}
        register={registerInput}
        additionalStyle={cn(
          'text-right text-lg',
          rest.readOnly && 'text-xl',
          rest.disabled && 'opacity-50 input-disabled',
        )}
        {...rest}
      />
    )}
  </div>
);
