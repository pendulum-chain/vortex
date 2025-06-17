import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { cn } from "../../../helpers/cn";
import { useGetAssetIcon } from "../../../hooks/useGetAssetIcon";

interface AssetButtonProps {
  assetIcon: string;
  tokenSymbol: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AssetButton({ assetIcon, tokenSymbol, onClick, disabled }: AssetButtonProps) {
  const icon = useGetAssetIcon(assetIcon);

  return (
    <button
      className={cn(
        " mt-0.5 flex h-8 cursor-pointer items-center rounded-full border border-blue-700 px-2 py-1 pr-3 text-base",
        disabled ? "cursor-not-allowed" : "hover:bg-blue-200"
      )}
      onClick={onClick}
      type="button"
      disabled={disabled}
    >
      <span className="mr-1 h-full rounded-full p-px">
        <img src={icon} alt={assetIcon} className="h-full min-h-5 max-w-min" />
      </span>
      <strong className="font-bold text-black">{tokenSymbol}</strong>
      <ChevronDownIcon className="w-6" />
    </button>
  );
}
