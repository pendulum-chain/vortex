import { FiatTokenDetails, OnChainTokenDetails } from "@packages/shared";
import { FC } from "react";
import { getTokenSymbol } from "../../helpers/getTokenSymbol";

interface ExchangeRateProps {
  inputToken: OnChainTokenDetails | FiatTokenDetails;
  outputToken: OnChainTokenDetails | FiatTokenDetails;
  exchangeRate?: number;
}

export const ExchangeRate: FC<ExchangeRateProps> = ({ exchangeRate, inputToken, outputToken }) => {
  const exchangeRateElement =
    inputToken !== undefined && exchangeRate ? (
      <>{`1 ${getTokenSymbol(inputToken)} = ${Number(exchangeRate).toFixed(4)} ${getTokenSymbol(outputToken)}`}</>
    ) : (
      `-`
    );

  return <span className="text-center">{exchangeRateElement}</span>;
};
