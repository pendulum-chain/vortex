import { FC } from 'react';
import { InputTokenDetails } from '../../constants/tokenConfig';

interface ExchangeRateProps {
  fromToken: InputTokenDetails;
  toTokenSymbol: string;
  exchangeRate?: string;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ exchangeRate, fromToken, toTokenSymbol }) => {
  const exchangeRateElement =
    fromToken !== undefined && exchangeRate ? (
      <>{`1 ${fromToken.assetSymbol} = ${Number(exchangeRate).toFixed(4)} ${toTokenSymbol}`}</>
    ) : (
      `-`
    );

  return <span className="text-center">{exchangeRateElement}</span>;
};
