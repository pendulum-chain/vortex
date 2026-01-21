import { Networks } from "@vortexfi/shared";
import { FC, memo, useState } from "react";
import placeholderIcon from "../../assets/coins/placeholder.svg";
import { cn } from "../../helpers/cn";
import { NETWORK_ICONS } from "../../hooks/useGetNetworkIcon";

interface TokenIconWithNetworkProps {
  iconSrc: string;
  tokenSymbol: string;
  network?: Networks;
  className?: string;
  showNetworkOverlay?: boolean;
}

export const TokenIconWithNetwork: FC<TokenIconWithNetworkProps> = memo(function TokenIconWithNetwork({
  iconSrc,
  tokenSymbol,
  network,
  className = "w-10",
  showNetworkOverlay = true
}) {
  const [imgError, setImgError] = useState(false);
  const networkIcon = network ? NETWORK_ICONS[network as keyof typeof NETWORK_ICONS] : undefined;
  const shouldShowOverlay = showNetworkOverlay && networkIcon;

  return (
    <div className={cn("relative", className)}>
      <img
        alt={tokenSymbol}
        className="h-full w-full rounded-full object-contain"
        decoding="async"
        loading="lazy"
        onError={() => setImgError(true)}
        src={imgError ? placeholderIcon : iconSrc}
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
