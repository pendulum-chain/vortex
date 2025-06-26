import { FiatTokenDetails } from "@packages/shared";
import { FC, HTMLAttributes } from "react";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";

interface Props extends HTMLAttributes<HTMLImageElement> {
  fiat: FiatTokenDetails;
}

export const FiatIcon: FC<Props> = ({ fiat, ...props }) => {
  const iconSrc = useGetAssetIcon(fiat.assetSymbol.toLowerCase());

  if (iconSrc) return <img alt={fiat.fiat.name} src={iconSrc} {...props} />;

  return <></>;
};
