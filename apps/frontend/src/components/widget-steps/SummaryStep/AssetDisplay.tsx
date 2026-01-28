import { FC, useState } from "react";
import placeholderIcon from "../../../assets/coins/placeholder.svg";
import { cn } from "../../../helpers/cn";

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  iconAlt: string;
  fallbackIconSrc?: string;
}

export const AssetDisplay: FC<AssetDisplayProps> = ({ amount, symbol, iconSrc, iconAlt, fallbackIconSrc }) => {
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);

  const getImageSrc = () => {
    if (!imgError) return iconSrc;
    if (fallbackIconSrc && !fallbackError) return fallbackIconSrc;
    return placeholderIcon;
  };

  const handleError = () => {
    if (!imgError) {
      setImgError(true);
      setIsLoading(true);
    } else if (fallbackIconSrc && !fallbackError) {
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
    <div className="flex w-full items-center justify-between">
      <span className="font-bold text-lg">
        {amount} {symbol}
      </span>
      <div className="relative h-8 w-8">
        {isLoading && <div className="absolute inset-0 rounded-full bg-gray-200" />}
        <img
          alt={iconAlt}
          className={cn("h-full w-full rounded-full", isLoading && "opacity-0")}
          onError={handleError}
          onLoad={handleLoad}
          src={getImageSrc()}
        />
      </div>
    </div>
  );
};
