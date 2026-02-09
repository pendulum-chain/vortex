import { Networks } from "@vortexfi/shared";
import Arrow from "../../assets/arrow.svg";
import { useTokenIcon } from "../../hooks/useTokenIcon";
import { TokenIconWithNetwork } from "../TokenIconWithNetwork";

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
  showIcons = false,
  layout = "horizontal",
  className = "",
  showApproximation = false,
  inputNetwork,
  outputNetwork,
  inputIcon: inputIconProp,
  outputIcon: outputIconProp,
  inputFallbackIcon: inputFallbackIconProp,
  outputFallbackIcon: outputFallbackIconProp
}: CurrencyExchangeProps) => {
  const inputIconFallback = useTokenIcon(inputCurrency, inputNetwork);
  const outputIconFallback = useTokenIcon(outputCurrency, outputNetwork);

  const inputIcon = inputIconProp ?? inputIconFallback.iconSrc;
  const outputIcon = outputIconProp ?? outputIconFallback.iconSrc;
  const inputFallbackIcon = inputFallbackIconProp ?? inputIconFallback.fallbackIconSrc;
  const outputFallbackIcon = outputFallbackIconProp ?? outputIconFallback.fallbackIconSrc;

  if (layout === "vertical") {
    return (
      <div className={`flex flex-col gap-4 ${className}`}>
        <div className="flex flex-col">
          <div className="text-gray-500">You send</div>
          <div className="flex grow items-center font-bold">
            {showIcons && (
              <TokenIconWithNetwork
                className="mr-2 h-6 w-6"
                fallbackIconSrc={inputFallbackIcon}
                iconSrc={inputIcon}
                network={inputNetwork}
                showNetworkOverlay={!!inputNetwork}
                tokenSymbol={inputCurrency}
              />
            )}
            {inputAmount} {inputCurrency.toUpperCase()}
          </div>
        </div>
        <div className="flex flex-col">
          <div className="text-gray-500">You get</div>
          <div className="flex grow items-center justify-end font-bold">
            {showIcons && (
              <TokenIconWithNetwork
                className="mr-2 h-6 w-6"
                fallbackIconSrc={outputFallbackIcon}
                iconSrc={outputIcon}
                network={outputNetwork}
                showNetworkOverlay={!!outputNetwork}
                tokenSymbol={outputCurrency}
              />
            )}
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
