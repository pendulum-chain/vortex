import { QuoteResponse } from "@vortexfi/shared";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useGetAssetIcon } from "../../hooks/useGetAssetIcon";
import { CollapsibleCard, CollapsibleDetails, CollapsibleSummary, useCollapsibleCard } from "../CollapsibleCard";
import { CurrencyExchange } from "../CurrencyExchange";
import { ToggleButton } from "../ToggleButton";
import { TransactionId } from "../TransactionId";

interface QuoteSummaryProps {
  quote: QuoteResponse;
  className?: string;
  onHeightChange?: (height: number) => void;
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

export const QuoteSummary = ({ quote, className, onHeightChange }: QuoteSummaryProps) => {
  const cardRef = useRef<HTMLDivElement>(null);
  const isExpandedRef = useRef(false);
  const animationTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!cardRef.current || !onHeightChange) return;

    const resizeObserver = new ResizeObserver(entries => {
      for (const entry of entries) {
        // Only report height changes when the card is NOT expanded
        // This prevents the button from moving when the quote summary expands/collapses
        if (!isExpandedRef.current) {
          // Report the height including the bottom-2 positioning (0.5rem = 8px)
          const height = entry.contentRect.height + 8;
          onHeightChange(height);
        }
      }
    });

    resizeObserver.observe(cardRef.current);

    return () => {
      resizeObserver.disconnect();
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, [onHeightChange]);

  const handleToggle = (isExpanded: boolean) => {
    // Clear any pending timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    if (isExpanded) {
      // Expanding: immediately prevent height updates
      isExpandedRef.current = true;
    } else {
      // Collapsing: keep preventing height updates during animation
      // Then re-enable after animation completes to measure collapsed height
      animationTimeoutRef.current = setTimeout(() => {
        isExpandedRef.current = false;
      }, 350); // 300ms animation + 50ms buffer
    }
  };

  return (
    <div className={cn("absolute right-0 bottom-2 left-0 z-10", className)}>
      <CollapsibleCard onToggle={handleToggle} ref={cardRef}>
        <CollapsibleSummary>
          <QuoteSummaryCore quote={quote} />
        </CollapsibleSummary>
        <CollapsibleDetails>
          <QuoteSummaryDetails quote={quote} />
        </CollapsibleDetails>
      </CollapsibleCard>
    </div>
  );
};
