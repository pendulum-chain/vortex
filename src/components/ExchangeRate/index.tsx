import { FC } from 'preact/compat';
import { InputTokenDetails } from '../../constants/tokenConfig';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';

interface ExchangeRateProps {
  fromToken?: InputTokenDetails;
  toTokenSymbol?: string;
  tokenOutData: UseTokenOutAmountResult;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ tokenOutData, fromToken, toTokenSymbol }) => {
  const exchangeRate =
    fromToken !== undefined && toTokenSymbol !== undefined && !tokenOutData.isLoading && tokenOutData.data ? (
      <>{`1 ${fromToken.assetSymbol} = ${Number(tokenOutData.data.effectiveExchangeRate).toFixed(
        2,
      )} ${toTokenSymbol}`}</>
    ) : (
      `-`
    );

  return <p className="my-5 font-thin text-center">{exchangeRate}</p>;
};
