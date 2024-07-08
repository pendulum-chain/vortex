import { TokenDetails } from '../../constants/tokenConfig';
import { UseTokenOutAmountResult } from '../../hooks/nabla/useTokenAmountOut';
import { FC } from 'preact/compat';

interface ExchangeRateProps {
  fromToken?: TokenDetails;
  toToken?: TokenDetails;
  tokenOutData: UseTokenOutAmountResult;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ tokenOutData, fromToken, toToken }) => {
  const exchangeRate =
    fromToken !== undefined && toToken !== undefined && !tokenOutData.isLoading && tokenOutData.data !== undefined ? (
      <>{`1 ${fromToken.assetCode} = ${Number(tokenOutData.data.effectiveExchangeRate).toFixed(2)} ${
        toToken.assetCode
      }`}</>
    ) : (
      `-`
    );

  return <p className="font-thin text-center my-5">{exchangeRate}</p>;
};
