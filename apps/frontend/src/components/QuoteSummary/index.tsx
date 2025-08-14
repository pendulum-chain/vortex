import { QuoteResponse } from "@packages/shared/src/endpoints/quote.endpoints";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Arrow from "../../assets/arrow.svg";
import CopyIcon from "../../assets/copy-icon.svg";

interface QuoteSummaryProps {
  quote: QuoteResponse;
}

export const QuoteSummary = ({ quote }: QuoteSummaryProps) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };

  return (
    <div className="rounded-lg shadow-md p-4 bg-white">
      <div className="flex justify-between items-center cursor-pointer" onClick={toggleExpanded}>
        <div className="flex items-center">
          <div>
            <div className="text-gray-500 text-sm">Transaction ID</div>
            <div className="flex items-center">
              <span className="font-bold text-lg mr-2">{quote.id.substring(0, 10)}</span>
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
        </div>
        <div className="text-right">
          <div className="text-gray-500">
            {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
          </div>
          <div className="font-bold">
            {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
          </div>
        </div>
        <button className="p-2" type="button">
          <img
            alt="Toggle"
            className={`w-4 h-4 transform transition-transform ${isExpanded ? "rotate-180" : ""}`}
            src={Arrow}
          />
        </button>
      </div>
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="mt-4"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
          >
            <div className="grid grid-cols-2 gap-4">
              <div>
                <div className="text-gray-500">You send</div>
                <div className="font-bold text-lg">
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
              </div>
              <div className="text-right">
                <div className="text-gray-500">You get</div>
                <div className="font-bold text-lg">
                  ~ {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
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
    </div>
  );
};
