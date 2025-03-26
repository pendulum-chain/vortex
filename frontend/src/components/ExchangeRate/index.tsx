import { FC } from 'react';
import { OnChainTokenDetails } from 'shared';

interface ExchangeRateProps {
  fromToken: OnChainTokenDetails;
  toTokenSymbol: string;
  exchangeRate?: number;
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
