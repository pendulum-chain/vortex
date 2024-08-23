import { FC, useMemo } from 'preact/compat';
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
}

export const AssetNumericInput: FC<AssetNumericInputProps> = ({
  assetIcon,
  tokenSymbol,
  onClick,
  registerInput,
  ...rest
}) => {
  const memoizedAssetButton = useMemo(
    () => <AssetButton assetIcon={assetIcon} tokenSymbol={tokenSymbol} onClick={onClick} />,
    [assetIcon, tokenSymbol, onClick],
  );

  return (
    <div
      className={
        'flex pl-2 focus:outline-none input-ghost text-accent-content input-bordered input ' +
        (rest.disabled ? 'opacity-50 input-disabled' : '')
      }
    >
      <div className="flex items-center justify-between">
        {memoizedAssetButton}
        <div className="w-2"></div>
      </div>

      <NumericInput
        register={registerInput}
        additionalStyle="text-right text-lg w-full"
        disableStyles={true}
        {...rest}
      />
    </div>
  );
};
