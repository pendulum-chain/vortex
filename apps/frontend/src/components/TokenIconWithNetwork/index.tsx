import { Networks } from "@vortexfi/shared";
import { FC, memo } from "react";
import { cn } from "../../helpers/cn";
import { NETWORK_ICONS } from "../../hooks/useGetNetworkIcon";
import { TokenImage } from "../TokenImage";

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
  const networkIcon = network ? NETWORK_ICONS[network as keyof typeof NETWORK_ICONS] : undefined;
  const shouldShowOverlay = showNetworkOverlay && networkIcon;

  return (
    <div className={cn("relative", className)}>
      <TokenImage alt={tokenSymbol} className="h-full w-full" fallbackSrc={fallbackIconSrc} src={iconSrc} />
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
