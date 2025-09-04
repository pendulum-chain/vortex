import { QuoteResponse } from "@packages/shared";
import { CollapsibleCard, CollapsibleDetails, CollapsibleSummary, useCollapsibleCard } from "../CollapsibleCard";
import { CurrencyExchange } from "../CurrencyExchange";
import { ToggleButton } from "../ToggleButton";
import { TransactionId } from "../TransactionId";

interface QuoteSummaryProps {
  quote: QuoteResponse;
}

const QuoteSummaryCore = ({ quote }: { quote: QuoteResponse }) => {
  const { toggle, isExpanded, detailsId } = useCollapsibleCard();

  return (
    <>
      <div className="flex items-center">
        <TransactionId id={quote.id} />
      </div>
      <div className="mx-4 h-12 flex-grow border-gray-300 border-l" />
      <CurrencyExchange
        inputAmount={quote.inputAmount}
        inputCurrency={quote.inputCurrency}
        outputAmount={quote.outputAmount}
        outputCurrency={quote.outputCurrency}
      />
      <ToggleButton
        ariaControls={detailsId}
        ariaLabel={isExpanded ? "Hide exchange details" : "Show exchange details"}
        className="ml-4"
        isExpanded={isExpanded}
        onToggle={toggle}
      />
    </>
  );
};

const QuoteSummaryDetails = ({ quote }: { quote: QuoteResponse }) => {
  return (
    <>
      <div className="mb-4">
        <h3 className="mb-3 font-semibold text-gray-900">Exchange Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">You Send</div>
            <div className="flex items-center font-bold">
              {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">You Receive</div>
            <div className="flex items-center font-bold">
              ~ {quote.outputAmount} {quote.outputCurrency.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      <div>
        <TransactionId id={quote.id} label="Full Transaction ID" variant="full" />
      </div>
    </>
  );
};

export const QuoteSummary = ({ quote }: QuoteSummaryProps) => {
  return (
    <CollapsibleCard>
      <CollapsibleSummary>
        <QuoteSummaryCore quote={quote} />
      </CollapsibleSummary>
      <CollapsibleDetails>
        <QuoteSummaryDetails quote={quote} />
      </CollapsibleDetails>
    </CollapsibleCard>
  );
};
