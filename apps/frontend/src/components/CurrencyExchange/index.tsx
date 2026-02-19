import { Networks } from "@vortexfi/shared";
import Big from "big.js";
import Arrow from "../../assets/arrow.svg";
import { formatPrice } from "../../sections/individuals/FeeComparison/helpers";

interface CurrencyExchangeProps {
  inputAmount: string;
  inputCurrency: string;
  outputAmount: string;
  outputCurrency: string;
  showIcons?: boolean;
  layout?: "horizontal" | "vertical";
  className?: string;
  showApproximation?: boolean;
  inputNetwork?: Networks;
  outputNetwork?: Networks;
  inputIcon?: string;
  outputIcon?: string;
  inputFallbackIcon?: string;
  outputFallbackIcon?: string;
}

export const CurrencyExchange = ({
  inputAmount,
  inputCurrency,
  outputAmount,
  outputCurrency,
  className = "",
  showApproximation = false
}: CurrencyExchangeProps) => {
  return (
    <div className={`text-left text-xs sm:text-sm ${className}`}>
      <div className="flex items-center">
        <div className="text-gray-500">
          {formatPrice(Big(inputAmount))} {inputCurrency.toUpperCase()}
        </div>
        <img alt="arrow" className="mx-2 hidden h-3 w-3 rotate-90 transform sm:block" src={Arrow} />
      </div>
      <div className="font-bold">
        {showApproximation && "~ "}
        {formatPrice(Big(outputAmount))} {outputCurrency.toUpperCase()}
      </div>
    </div>
  );
};
