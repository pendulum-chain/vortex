import { ComponentChildren } from 'preact';
import { QueryOptions } from '../../constants/cache';
import { useContractBalance } from '../../shared/useContractBalance';
import { numberLoader } from '../Loader';

export type BalanceProps = {
  address?: string;
  fallback?: string | number;
  loader?: boolean;
  options?: QueryOptions;
  children?: ComponentChildren;
};

const Balance = ({ address, fallback = 0, loader = true, options, children }: BalanceProps): JSX.Element | null => {
  const { isLoading, formatted, enabled } = useContractBalance({ contractAddress: address }, options);
  if (!address || !enabled) return <>{fallback ?? null}</>;
  if (isLoading) return loader ? numberLoader : null;
  return (
    <span title={formatted}>
      {children}
      {formatted ?? fallback ?? null}
    </span>
  );
};
export default Balance;
