import { FC } from 'preact/compat';
import { InputTokenDetails, OutputTokenDetails } from '../../constants/tokenConfig';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';

interface ExchangeRateProps {
  fromToken?: InputTokenDetails;
  toToken?: OutputTokenDetails;
  tokenOutData: UseTokenOutAmountResult;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ tokenOutData, fromToken, toToken }) => {
  const exchangeRate =
    fromToken !== undefined && toToken !== undefined && !tokenOutData.isLoading && tokenOutData.data ? (
      <>{`1 ${fromToken.assetSymbol} = ${Number(tokenOutData.data.effectiveExchangeRate).toFixed(2)} ${
        toToken.stellarAsset.code.string
      }`}</>
    ) : (
      `-`
    );

  return <p className="my-5 font-thin text-center">{exchangeRate}</p>;
};
