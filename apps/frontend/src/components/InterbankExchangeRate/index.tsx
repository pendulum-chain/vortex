import { roundDownToSignificantDecimals } from "@vortexfi/shared";
import { FC } from "react";

interface InterbankExchangeRateProps {
  rate: number;
  inputCurrency: string;
  outputCurrency: string;
  className?: string;
  asSpan?: boolean;
}

function formatExchangeRateString(rate: number, input: string, output: string) {
  // Check the rate to determine how many decimal places to show
  // Always show at least 3 significant decimal places
  return `1 ${input} ≈ ${roundDownToSignificantDecimals(rate, 3)} ${output}`;
}

export const InterbankExchangeRate: FC<InterbankExchangeRateProps> = ({
  rate,
  inputCurrency,
  outputCurrency,
  className = "text-center text-gray-600 text-[15px]",
  asSpan = false
}) => {
  const content = formatExchangeRateString(rate, inputCurrency, outputCurrency);

  if (asSpan) {
    return <span className={className}>{content}</span>;
  }

  return <div className={className}>{content}</div>;
};
