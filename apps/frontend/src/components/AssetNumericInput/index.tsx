import { ChangeEvent, FC } from "react";
import { UseFormRegisterReturn } from "react-hook-form";
import { cn } from "../../helpers/cn";
import { RampFormValues } from "../../hooks/ramp/schema";
import { NumericInput } from "../NumericInput";
import { AssetButton } from "../buttons/AssetButton";

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
      "mt-1 mb-2 flex items-center py-1 pl-2",
      rest.readOnly ? "pr-0.5" : "input-vortex-primary input input-ghost w-full border-1 border-neutral-300"
    )}
  >
    <div className="flex items-center">
      <AssetButton assetIcon={assetIcon} tokenSymbol={tokenSymbol} onClick={onClick} />
    </div>

    {loading ? (
      <div className="loading loading-bars loading-md mr-4 ml-auto"></div>
    ) : (
      <NumericInput
        loading={loading}
        register={registerInput}
        additionalStyle={cn("text-right text-lg", rest.readOnly && "text-xl", rest.disabled && "input-disabled opacity-50")}
        {...rest}
      />
    )}
  </div>
);
