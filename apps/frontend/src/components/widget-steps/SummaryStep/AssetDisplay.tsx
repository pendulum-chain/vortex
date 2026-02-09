import { Networks } from "@vortexfi/shared";
import { FC } from "react";
import { TokenIconWithNetwork } from "../../TokenIconWithNetwork";

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  fallbackIconSrc?: string;
  network?: Networks;
}

export const AssetDisplay: FC<AssetDisplayProps> = ({ amount, symbol, iconSrc, fallbackIconSrc, network }) => (
  <div className="flex w-full items-center justify-between">
    <span className="font-bold text-lg">
      {amount} {symbol}
    </span>
    <TokenIconWithNetwork
      className="h-8 w-8"
      fallbackIconSrc={fallbackIconSrc}
      iconSrc={iconSrc}
      network={network}
      tokenSymbol={symbol}
    />
  </div>
);
