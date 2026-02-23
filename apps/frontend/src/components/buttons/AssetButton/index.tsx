import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { Networks } from "@vortexfi/shared";
import { cn } from "../../../helpers/cn";
import { useTokenIcon } from "../../../hooks/useTokenIcon";
import { TokenIconWithNetwork } from "../../TokenIconWithNetwork";

interface AssetButtonProps {
  assetIcon: string;
  tokenSymbol: string;
  logoURI?: string;
  fallbackLogoURI?: string;
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  network?: Networks;
}

export function AssetButton({
  assetIcon,
  tokenSymbol,
  onClick,
  disabled,
  loading,
  logoURI,
  fallbackLogoURI,
  network
}: AssetButtonProps) {
  const fallbackIcon = useTokenIcon(assetIcon);
  const primaryIcon = logoURI ?? fallbackIcon.iconSrc;

  return (
    <button
      className={cn(
        " mt-0.5 flex h-8 cursor-pointer items-center rounded-full border border-blue-700 px-2 py-1 pr-3 text-base",
        disabled || loading ? "cursor-not-allowed" : "hover:bg-blue-200"
      )}
      disabled={disabled || loading}
      onClick={onClick}
      type="button"
    >
      {loading ? (
        <div className="flex animate-pulse items-center gap-1">
          <div className="mr-1 h-5 w-5 rounded-full bg-neutral-300" />
          <div className="h-3 w-12 rounded bg-neutral-300" />
          <ChevronDownIcon className="w-6 opacity-30" />
        </div>
      ) : (
        <>
          <TokenIconWithNetwork
            className="mr-1 h-5 w-5"
            fallbackIconSrc={fallbackLogoURI ?? fallbackIcon.fallbackIconSrc}
            iconSrc={primaryIcon}
            network={network}
            showNetworkOverlay={!!network}
            tokenSymbol={assetIcon}
          />
          <strong className="font-bold text-black">{tokenSymbol}</strong>
          <ChevronDownIcon className="w-6" />
        </>
      )}
    </button>
  );
}
