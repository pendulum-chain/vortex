import { FiatTokenDetails } from "@vortexfi/shared";
import { FC, HTMLAttributes } from "react";
import { useTokenIcon } from "../../hooks/useTokenIcon";

interface Props extends HTMLAttributes<HTMLImageElement> {
  fiat: FiatTokenDetails;
}

export const FiatIcon: FC<Props> = ({ fiat, ...props }) => {
  const { iconSrc } = useTokenIcon(fiat);

  if (iconSrc) return <img alt={fiat.fiat.name} src={iconSrc} {...props} />;

  return <></>;
};
