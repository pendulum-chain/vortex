import { FC, HTMLAttributes } from 'react';
import { FiatTokenDetails } from 'shared';
import { useGetAssetIcon } from '../../hooks/useGetAssetIcon';

interface Props extends HTMLAttributes<HTMLImageElement> {
  fiat: FiatTokenDetails;
}

export const FiatIcon: FC<Props> = ({ fiat, ...props }) => {
  const iconSrc = useGetAssetIcon(fiat.assetSymbol.toLowerCase());

  if (iconSrc) return <img src={iconSrc} alt={fiat.fiat.name} {...props} />;

  return <></>;
};
