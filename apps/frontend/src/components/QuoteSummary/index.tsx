import { ChevronDownIcon, ChevronUpIcon } from "@heroicons/react/20/solid";
import { QuoteResponse } from "@packages/shared";
import { AnimatePresence, motion } from "framer-motion";
import { useState } from "react";
import Arrow from "../../assets/arrow.svg";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { CopyablePublicKey } from "../PublicKey/CopyablePublicKey";

interface QuoteSummaryProps {
  quote: QuoteResponse;
}

export const QuoteSummary = ({ quote }: QuoteSummaryProps) => {
  const [isExpanded, setIsExpanded] = useState(false);
  const toggleExpanded = () => setIsExpanded(!isExpanded);

  const inputIcon = useGetAssetIcon(quote.inputCurrency.toLowerCase());
  const outputIcon = useGetAssetIcon(quote.outputCurrency.toLowerCase());

  return (
    <motion.div
      className="rounded-lg border border-blue-700 bg-white p-4 shadow-md"
      layout
      transition={{ duration: 0.3, type: "spring" }}
    >
      <AnimatePresence initial={false} mode="wait">
        {!isExpanded ? (
          <motion.div
            animate={{ opacity: 1 }}
            className="flex items-center justify-between"
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
            <div className="mx-4 h-12 flex-grow border-gray-300 border-l" />
            <div className="text-left text-sm">
              <div className="flex items-center">
                <div className="text-gray-500">
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
                <img alt="arrow" className="mx-2 h-3 w-3 rotate-90 transform" src={Arrow} />
              </div>
              <div className="font-bold">
                {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
              </div>
            </div>
            <button className="btn btn-sm ml-4 h-8! rounded-full bg-blue-100 p-2" onClick={toggleExpanded} type="button">
              <ChevronDownIcon className="h-4 w-4" />
            </button>
          </motion.div>
        ) : (
          <motion.div animate={{ opacity: 1 }} exit={{ opacity: 0 }} initial={{ opacity: 0 }} key="expanded">
            <div className="flex items-center justify-between">
              <h2 className="font-bold text-lg">Exchange details</h2>
              <button className="btn btn-sm h-8! rounded-full bg-blue-100 p-2" onClick={toggleExpanded} type="button">
                <ChevronUpIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div className="flex flex-col">
                <div className="text-gray-500">You send</div>
                <div className="flex grow items-center font-bold">
                  <img alt={quote.inputCurrency} className="mr-2 h-6 w-6" src={inputIcon} />
                  {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
                </div>
              </div>
              <div className="flex flex-col">
                <div className="text-gray-500">You get</div>
                <div className="flex grow items-center justify-end font-bold">
                  <img alt={quote.outputCurrency} className="mr-2 h-6 w-6" src={outputIcon} />~ {quote.outputAmount}{" "}
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
