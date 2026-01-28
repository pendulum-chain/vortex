import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { cn } from "../../../helpers/cn";
import { useGetAssetIcon } from "../../../hooks/useGetAssetIcon";
import { TokenImage } from "../../TokenImage";

interface AssetButtonProps {
  assetIcon: string;
  tokenSymbol: string;
  logoURI?: string;
  fallbackLogoURI?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AssetButton({ assetIcon, tokenSymbol, onClick, disabled, logoURI, fallbackLogoURI }: AssetButtonProps) {
  const localIcon = useGetAssetIcon(assetIcon);
  const primaryIcon = logoURI ?? localIcon;

  return (
    <button
      className={cn(
        " mt-0.5 flex h-8 cursor-pointer items-center rounded-full border border-blue-700 px-2 py-1 pr-3 text-base",
        disabled ? "cursor-not-allowed" : "hover:bg-blue-200"
      )}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <TokenImage alt={assetIcon} className="mr-1 h-5 w-5" fallbackSrc={fallbackLogoURI} src={primaryIcon} />
      <strong className="font-bold text-black">{tokenSymbol}</strong>
      <ChevronDownIcon className="w-6" />
    </button>
  );
}
