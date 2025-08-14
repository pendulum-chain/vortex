import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";
import { FiatTokenDetails, RampCurrency } from "@packages/shared";
import { QuoteResponse } from "@packages/shared/src/endpoints/quote.endpoints";
import { TOKEN_CONFIG } from "@packages/shared/src/tokens/tokenConfig";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Arrow from "../../assets/arrow.svg";
import { FiatIcon } from "../FiatIcon";
import { CopyablePublicKey } from "../PublicKey/CopyablePublicKey";

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
      className="rounded-lg shadow-md p-4 bg-white border border-blue-700"
      layout
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
                <CopyablePublicKey inline={true} publicKey={quote.id} variant="shorter" wrap={true} />
              </div>
            </div>
            <div className="flex-grow border-l border-gray-300 mx-4 h-12" />
            <div className="text-sm text-left">
              <div className="flex items-center">
                <div className="text-gray-500">
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
                <img alt="arrow" className="w-3 h-3 transform rotate-90 mx-2" src={Arrow} />
              </div>
              <div className="font-bold">
                {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
              </div>
            </div>
            <button className="p-2 ml-4 btn btn-sm h-8! bg-blue-100 rounded-full" onClick={toggleExpanded} type="button">
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </motion.div>
        ) : (
          <motion.div animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }} key="expanded">
            <div className="flex justify-between items-center">
              <h2 className="text-lg font-bold">Exchange details</h2>
              <button className="p-2 btn btn-sm h-8! bg-blue-100 rounded-full" onClick={toggleExpanded} type="button">
                <ChevronUpIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-4">
              <div className="flex flex-col">
                <div className="text-gray-500">You send</div>
                <div className="flex items-center font-bold grow">
                  {inputFiatDetails && <FiatIcon className="w-6 h-6 mr-2" fiat={inputFiatDetails} />}
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-gray-500">You get</div>
                <div className="flex items-center font-bold justify-end grow">
                  {outputFiatDetails && <FiatIcon className="w-6 h-6 mr-2" fiat={outputFiatDetails} />}~ {quote.outputAmount}{" "}
                  {quote.outputCurrency.toUpperCase()}
                </div>
              </div>
            </div>
            <div className="mt-4">
              <div className="text-gray-500">Transaction ID</div>
              <div className="flex items-center">
                <CopyablePublicKey inline={true} publicKey={quote.id} variant="full" wrap={true} />
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
};
