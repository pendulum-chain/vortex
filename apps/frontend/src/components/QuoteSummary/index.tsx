import { QuoteResponse } from "@vortexfi/shared";
import { useRef } from "react";
import { useTranslation } from "react-i18next";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { CollapsibleCard, CollapsibleDetails, CollapsibleSummary, useCollapsibleCard } from "../CollapsibleCard";
import { CurrencyExchange } from "../CurrencyExchange";
import { ToggleButton } from "../ToggleButton";
import { TransactionId } from "../TransactionId";

interface QuoteSummaryProps {
  quote: QuoteResponse;
}

const QuoteSummaryCore = ({ quote }: { quote: QuoteResponse }) => {
  const { t } = useTranslation();
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
        ariaLabel={
          isExpanded ? t("components.quoteSummary.hideExchangeDetails") : t("components.quoteSummary.showExchangeDetails")
        }
        className="ml-4"
        isExpanded={isExpanded}
        onToggle={toggle}
      />
    </>
  );
};

const QuoteSummaryDetails = ({ quote }: { quote: QuoteResponse }) => {
  const { t } = useTranslation();
  const inputIcon = useGetAssetIcon(quote.inputCurrency.toLowerCase());
  const outputIcon = useGetAssetIcon(quote.outputCurrency.toLowerCase());

  return (
    <section className="overflow-hidden">
      <div className="mb-4">
        <h3 className="mb-3 font-semibold text-gray-900">{t("components.quoteSummary.exchangeDetails")}</h3>
        <div className="grid grid-cols-2 gap-4">
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">{t("components.quoteSummary.youSend")}</div>
            <div className="flex items-center font-bold">
              <img alt={quote.inputCurrency} className="mr-2 h-5 w-5" src={inputIcon} />
              {quote.inputAmount} {quote.inputCurrency.toUpperCase()}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">{t("components.quoteSummary.youReceive")}</div>
            <div className="flex items-center font-bold">
              <img alt={quote.outputCurrency} className="mr-2 h-5 w-5" src={outputIcon} />~ {quote.outputAmount}{" "}
              {quote.outputCurrency.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      <div>
        <TransactionId id={quote.id} label={t("components.quoteSummary.fullTransactionId")} variant="full" />
      </div>
    </section>
  );
};

export const QuoteSummary = ({ quote }: QuoteSummaryProps) => {
  const cardRef = useRef<HTMLDivElement>(null);

  const handleToggle = (isExpanded: boolean) => {
    if (isExpanded && cardRef.current) {
      // Wait for the animation to complete (300ms) before scrolling
      setTimeout(() => {
        cardRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end"
        });
      }, 300);
    }
  };

  return (
    <CollapsibleCard onToggle={handleToggle} ref={cardRef}>
      <CollapsibleSummary>
        <QuoteSummaryCore quote={quote} />
      </CollapsibleSummary>
      <CollapsibleDetails>
        <QuoteSummaryDetails quote={quote} />
      </CollapsibleDetails>
    </CollapsibleCard>
  );
};
