/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/no-unused-vars */
import { memo } from 'preact/compat';
import { Skeleton } from '../../Skeleton';

// ! TODO: implement this component for fetching token prices
export type TokenPriceProps = {
  address: string;
  amount?: number;
  prefix?: ReactNode;
  options?: any;
  loader?: ReactNode;
  fallback?: ReactNode;
};

const TokenPrice = memo(
  ({ address, amount = 1, prefix, loader, fallback = null, options }: TokenPriceProps): JSX.Element | null => {
    const { data, isLoading } = { data: 120.3, isLoading: false }; //useTokenPrice(address, chainId, options);
    if (isLoading) return <>{loader}</> || <Skeleton className="inline-flex">10000</Skeleton>;
    if (!data) return <>{fallback}</>;
    const price = data;
    return (
      <span>
        {prefix}${price}
      </span>
    );
  },
);
export default TokenPrice;
