import { Networks, getNetworkDisplayName } from '@packages/shared';
import { FC, HTMLAttributes } from 'react';
import { useGetNetworkIcon } from '../../hooks/useGetNetworkIcon';

interface Props extends HTMLAttributes<HTMLImageElement> {
  network: Networks;
}

export const NetworkIcon: FC<Props> = ({ network, ...props }) => {
  const iconSrc = useGetNetworkIcon(network);

  if (iconSrc) return <img src={iconSrc} alt={getNetworkDisplayName(network)} {...props} />;

  return <></>;
};
