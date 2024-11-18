import { FC } from 'preact/compat';
import { InputTokenDetails } from '../../constants/tokenConfig';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';

interface ExchangeRateProps {
  fromToken?: InputTokenDetails;
  toTokenSymbol: string;
  tokenOutData: UseTokenOutAmountResult;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ tokenOutData, fromToken, toTokenSymbol }) => {
  if (!fromToken) {
    return <span className="text-center">N/A</span>;
  }

  const exchangeRate =
    !tokenOutData.isLoading && tokenOutData.data ? (
      <>{`1 ${fromToken.assetSymbol} = ${Number(tokenOutData.data.effectiveExchangeRate).toFixed(
        4,
      )} ${toTokenSymbol}`}</>
    ) : (
      `-`
    );

  return <span className="text-center">{exchangeRate}</span>;
};
