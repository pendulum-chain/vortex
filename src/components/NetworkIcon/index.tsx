import { FC, HTMLAttributes } from 'preact/compat';
import { useGetNetworkIcon, NetworkIconType } from '../../hooks/useGetNetworkIcon';

interface Props extends HTMLAttributes<HTMLImageElement> {
  chainId: NetworkIconType;
}

export const NetworkIcon: FC<Props> = ({ chainId, ...props }) => {
  const iconSrc = useGetNetworkIcon(chainId);

  if (iconSrc) return <img src={iconSrc} alt={chainId} {...props} />;

  return <></>;
};
