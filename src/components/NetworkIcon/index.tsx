import { FC, HTMLAttributes } from 'preact/compat';
import { useGetNetworkIcon } from '../../hooks/useGetNetworkIcon';
import { getNetworkDisplayName, Networks } from '../../helpers/networks';

interface Props extends HTMLAttributes<HTMLImageElement> {
  network: Networks;
}

export const NetworkIcon: FC<Props> = ({ network, ...props }) => {
  const iconSrc = useGetNetworkIcon(network);

  if (iconSrc) return <img src={iconSrc} alt={getNetworkDisplayName(network)} {...props} />;

  return <></>;
};
