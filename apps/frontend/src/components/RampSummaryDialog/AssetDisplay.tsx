import { FC } from "react";

interface AssetDisplayProps {
  amount: string;
  symbol: string;
  iconSrc: string;
  iconAlt: string;
}

export const AssetDisplay: FC<AssetDisplayProps> = ({ amount, symbol, iconSrc, iconAlt }) => (
  <div className="flex w-full items-center justify-between">
    <span className="font-bold text-lg">
      {amount} {symbol}
    </span>
    <img alt={iconAlt} className="h-8 w-8" src={iconSrc} />
  </div>
);
