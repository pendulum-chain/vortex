import { FC } from "react";
import { TokenImage } from "../../TokenImage";

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  iconAlt: string;
  fallbackIconSrc?: string;
}

export const AssetDisplay: FC<AssetDisplayProps> = ({ amount, symbol, iconSrc, iconAlt, fallbackIconSrc }) => (
  <div className="flex w-full items-center justify-between">
    <span className="font-bold text-lg">
      {amount} {symbol}
    </span>
    <TokenImage alt={iconAlt} className="h-8 w-8" fallbackSrc={fallbackIconSrc} src={iconSrc} />
  </div>
);
