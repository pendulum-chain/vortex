import type { ChangeEvent, FC } from "react";
import type { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";
import type { RampFormValues } from "../../hooks/ramp/schema";
import { AssetButton } from "../buttons/AssetButton";
import { NumericInput } from "../NumericInput";

// A helper function to determine the number of decimals based on the token symbol.
// For now, it assumes that ETH-based tokens have 6 decimals and others have 2.
function getMaxDecimalsForToken(tokenSymbol: string): number {
  return tokenSymbol.toLowerCase().includes("eth") ? 4 : 2;
}

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
    className={cn(
      "mt-1 mb-2 flex items-center py-1 pl-2",
      rest.readOnly ? "pr-0.5" : "input-vortex-primary input input-ghost w-full border-1 border-neutral-300"
    )}
  >
    <div className="flex items-center">
      <AssetButton assetIcon={assetIcon} onClick={onClick} tokenSymbol={tokenSymbol} />
    </div>

    {loading ? (
      <div className="loading loading-bars loading-md mr-4 ml-auto"></div>
    ) : (
      <NumericInput
        additionalStyle={cn("text-right text-lg", rest.readOnly && "text-xl", rest.disabled && "input-disabled opacity-50")}
        loading={loading}
        maxDecimals={getMaxDecimalsForToken(tokenSymbol)}
        register={registerInput}
        {...rest}
      />
    )}
  </div>
);
