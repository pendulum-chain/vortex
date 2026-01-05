import { getNetworkDisplayName, Networks } from "@vortexfi/shared";
import { FC, HTMLAttributes } from "react";
import { useGetNetworkIcon } from "../../hooks/useGetNetworkIcon";

interface Props extends HTMLAttributes<HTMLImageElement> {
  network: Networks;
}

export const NetworkIcon: FC<Props> = ({ network, ...props }) => {
  const iconSrc = useGetNetworkIcon(network);

  if (iconSrc) return <img alt={getNetworkDisplayName(network)} src={iconSrc} {...props} />;

  return <></>;
};
