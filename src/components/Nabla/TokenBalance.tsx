import { Skeleton } from '../Skeleton';
import { BalanceInfo } from './BalanceState';

export function NumberLoader() {
  return <Skeleton className="inline-block">10000</Skeleton>;
}

export interface TokenBalancProps {
  query: BalanceInfo | undefined;
  symbol: string | undefined;
  significantDecimals?: 2 | 4;
}

export function TokenBalance({ query, symbol, significantDecimals }: TokenBalancProps): JSX.Element | null {
  if (!query) {
    return <NumberLoader />;
  }

  //   if (error || !data) {
  //     return <span>N/A</span>;
  //   }

  const approximateString =
    significantDecimals === 4 ? query.approximateStrings.atLeast4Decimals : query.approximateStrings.atLeast2Decimals;
  return (
    <span title={query.preciseString}>
      {approximateString} {symbol ? symbol : null}
    </span>
  );
}
