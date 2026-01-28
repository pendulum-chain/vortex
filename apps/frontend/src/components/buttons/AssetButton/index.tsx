import { ChevronDownIcon } from "@heroicons/react/20/solid";
import { useState } from "react";
import placeholderIcon from "../../../assets/coins/placeholder.svg";
import { cn } from "../../../helpers/cn";
import { useGetAssetIcon } from "../../../hooks/useGetAssetIcon";

interface AssetButtonProps {
  assetIcon: string;
  tokenSymbol: string;
  logoURI?: string;
  fallbackLogoURI?: string;
  onClick: () => void;
  disabled?: boolean;
}

export function AssetButton({ assetIcon, tokenSymbol, onClick, disabled, logoURI, fallbackLogoURI }: AssetButtonProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const localIcon = useGetAssetIcon(assetIcon);
  const primaryIcon = logoURI ?? localIcon;

  const getImageSrc = () => {
    if (!imgError) return primaryIcon;
    if (fallbackLogoURI && !fallbackError) return fallbackLogoURI;
    return placeholderIcon;
  };

  const handleError = () => {
    if (!imgError) {
      setImgError(true);
      setIsLoading(true);
    } else if (fallbackLogoURI && !fallbackError) {
      setFallbackError(true);
      setIsLoading(true);
    } else {
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

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
      <span className="relative mr-1 h-full min-h-5 w-5 rounded-full p-px">
        {isLoading && <div className="absolute inset-0 rounded-full bg-gray-200" />}
        <img
          alt={assetIcon}
          className={cn("h-full max-w-min rounded-full", isLoading && "opacity-0")}
          onError={handleError}
          onLoad={handleLoad}
          src={getImageSrc()}
        />
      </span>
      <strong className="font-bold text-black">{tokenSymbol}</strong>
      <ChevronDownIcon className="w-6" />
    </button>
  );
}
