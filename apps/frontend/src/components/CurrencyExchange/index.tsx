import Arrow from "../../assets/arrow.svg";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";

interface CurrencyExchangeProps {
  inputAmount: string;
  inputCurrency: string;
  outputAmount: string;
  outputCurrency: string;
  showIcons?: boolean;
  layout?: "horizontal" | "vertical";
  className?: string;
  showApproximation?: boolean;
}

export const CurrencyExchange = ({
  inputAmount,
  inputCurrency,
  outputAmount,
  outputCurrency,
  showIcons = false,
  layout = "horizontal",
  className = "",
  showApproximation = false
}: CurrencyExchangeProps) => {
  const inputIcon = useGetAssetIcon(inputCurrency.toLowerCase());
  const outputIcon = useGetAssetIcon(outputCurrency.toLowerCase());

  if (layout === "vertical") {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        <div className="flex flex-col">
          <div className="text-gray-500">You send</div>
          <div className="flex grow items-center font-bold">
            {showIcons && <img alt={inputCurrency} className="mr-2 h-6 w-6" src={inputIcon} />}
            {inputAmount} {inputCurrency.toUpperCase()}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-gray-500">You get</div>
          <div className="flex grow items-center justify-end font-bold">
            {showIcons && <img alt={outputCurrency} className="mr-2 h-6 w-6" src={outputIcon} />}
            {showApproximation && "~ "}
            {outputAmount} {outputCurrency.toUpperCase()}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`text-left text-sm ${className}`}>
      <div className="flex items-center">
        <div className="text-gray-500">
          {inputAmount} {inputCurrency.toUpperCase()}
        </div>
        <img alt="arrow" className="mx-2 h-3 w-3 rotate-90 transform" src={Arrow} />
      </div>
      <div className="font-bold">
        {showApproximation && "~ "}
        {outputAmount} {outputCurrency.toUpperCase()}
      </div>
    </div>
  );
};
