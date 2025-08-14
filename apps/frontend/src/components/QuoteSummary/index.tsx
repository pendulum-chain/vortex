import { FiatTokenDetails, RampCurrency } from "@packages/shared";
import { QuoteResponse } from "@packages/shared/src/endpoints/quote.endpoints";
import { TOKEN_CONFIG } from "@packages/shared/src/tokens/tokenConfig";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Arrow from "../../assets/arrow.svg";
import CopyIcon from "../../assets/copy-icon.svg";
import { FiatIcon } from "../FiatIcon";

interface QuoteSummaryProps {
  quote: QuoteResponse;
}

const getFiatTokenDetails = (currency: RampCurrency): FiatTokenDetails | undefined => {
  const fiatToken = TOKEN_CONFIG[currency as keyof typeof TOKEN_CONFIG];
  if (fiatToken) {
    // This is a hack, we need a proper way to get the fiat details
    return {
      assetSymbol: currency,
      fiat: {
        assetIcon: "",
        name: currency.toUpperCase(),
        symbol: currency.toUpperCase()
      }
    } as FiatTokenDetails;
  }
  return undefined;
};

export const QuoteSummary = ({ quote }: QuoteSummaryProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const inputFiatDetails = getFiatTokenDetails(quote.inputCurrency);
  const outputFiatDetails = getFiatTokenDetails(quote.outputCurrency);

  return (
    <motion.div
      className="rounded-lg shadow-md p-4 bg-white border border-blue-700 cursor-pointer"
      layout
      onClick={toggleExpanded}
      transition={{ duration: 0.3, type: "spring" }}
    >
      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex justify-between items-center"
            exit={{ opacity: 0 }}
            initial={{ opacity: 0 }}
            key="collapsed"
          >
            <div className="flex items-center">
              <div>
                <div className="text-gray-500 text-sm">Transaction ID</div>
                <div className="flex items-center">
                  <span className="font-bold text-lg mr-2">{quote.id.substring(0, 10)}</span>
                  <button
                    className="bg-transparent border-none p-0"
                    onClick={e => {
                      e.stopPropagation();
                      navigator.clipboard.writeText(quote.id);
                    }}
                    type="button"
                  >
                    <img alt="Copy" className="w-4 h-4" src={CopyIcon} />
                  </button>
                </div>
              </div>
            </div>
            <div className="flex-grow border-l border-gray-300 mx-4 h-12" />
            <div className="text-right">
              <div className="flex items-center justify-end">
                <div className="text-gray-500">
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
                <img alt="arrow" className="w-3 h-3 transform rotate-90 mx-2" src={Arrow} />
              </div>
              <div className="font-bold">
                {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
              </div>
            </div>
            <div className="p-2 ml-4 bg-blue-100 rounded-full">
              <img alt="Toggle" className="w-4 h-4 transform rotate-180" src={Arrow} />
            </div>
          </motion.div>
        ) : (
          <motion.div animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }} key="expanded">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Exchange details</h2>
              <div className="p-2 bg-blue-100 rounded-full">
                <img alt="Toggle" className="w-4 h-4" src={Arrow} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div>
                <div className="text-gray-500">You send</div>
                <div className="flex items-center font-bold text-lg">
                  {inputFiatDetails && <FiatIcon className="w-6 h-6 mr-2" fiat={inputFiatDetails} />}
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">You get</div>
                <div className="flex items-center font-bold text-lg justify-end">
                  {outputFiatDetails && <FiatIcon className="w-6 h-6 mr-2" fiat={outputFiatDetails} />}~ {quote.outputAmount}{" "}
                  {quote.outputCurrency.toUpperCase()}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-gray-500">Transaction ID</div>
              <div className="flex items-center">
                <span className="font-bold text-lg mr-2">{quote.id}</span>
                <button
                  onClick={e => {
                    e.stopPropagation();
                    navigator.clipboard.writeText(quote.id);
                  }}
                  type="button"
                >
                  <img alt="Copy" className="w-4 h-4" src={CopyIcon} />
                </button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
