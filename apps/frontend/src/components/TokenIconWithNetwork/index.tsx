import { Networks } from "@vortexfi/shared";
import { FC, memo, useState } from "react";
import placeholderIcon from "../../assets/coins/placeholder.svg";
import { cn } from "../../helpers/cn";
import { NETWORK_ICONS } from "../../hooks/useGetNetworkIcon";

interface TokenIconWithNetworkProps {
  iconSrc: string;
  fallbackIconSrc?: string;
  tokenSymbol: string;
  network?: Networks;
  className?: string;
  showNetworkOverlay?: boolean;
}

export const TokenIconWithNetwork: FC<TokenIconWithNetworkProps> = memo(function TokenIconWithNetwork({
  iconSrc,
  fallbackIconSrc,
  tokenSymbol,
  network,
  className = "w-10",
  showNetworkOverlay = true
}) {
  const [isLoading, setIsLoading] = useState(true);
  const [imgError, setImgError] = useState(false);
  const [fallbackError, setFallbackError] = useState(false);
  const networkIcon = network ? NETWORK_ICONS[network as keyof typeof NETWORK_ICONS] : undefined;
  const shouldShowOverlay = showNetworkOverlay && networkIcon;

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
    <div className={cn("relative", className)}>
      {isLoading && <div className="absolute inset-0 rounded-full bg-gray-200" />}
      <img
        alt={tokenSymbol}
        className={cn("h-full w-full rounded-full object-contain", isLoading && "opacity-0")}
        decoding="async"
        loading="lazy"
        onError={handleError}
        onLoad={handleLoad}
        src={getImageSrc()}
      />
      {shouldShowOverlay && (
        <img
          alt={`${network} network`}
          className="-bottom-0.5 -right-0.5 absolute h-[40%] w-[40%] rounded-full object-contain"
          decoding="async"
          loading="lazy"
          src={networkIcon}
        />
      )}
    </div>
  );
});
