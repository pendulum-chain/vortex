import { QuoteResponse, RampDirection } from "@vortexfi/shared";
import Big from "big.js";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { useTokenIcon } from "../../hooks/useTokenIcon";
import { formatPrice } from "../../sections/individuals/FeeComparison/helpers";
import { CollapsibleCard, CollapsibleDetails, CollapsibleSummary, useCollapsibleCard } from "../CollapsibleCard";
import { CurrencyExchange } from "../CurrencyExchange";
import { ToggleButton } from "../ToggleButton";
import { TokenIconWithNetwork } from "../TokenIconWithNetwork";
import { TransactionId } from "../TransactionId";

interface QuoteSummaryProps {
  quote: QuoteResponse;
  className?: string;
}

/**
 * Hook to get token icons for both currencies in a quote.
 * Determines which currency is on-chain based on ramp type.
 */
function useQuoteTokenIcons(quote: QuoteResponse) {
  const isOfframp = quote.rampType === RampDirection.SELL;

  // For offramp: input is on-chain (has network), output is fiat (no network)
  // For onramp: input is fiat (no network), output is on-chain (has network)
  const inputIcon = useTokenIcon(quote.inputCurrency, isOfframp ? quote.network : undefined);
  const outputIcon = useTokenIcon(quote.outputCurrency, !isOfframp ? quote.network : undefined);

  return { inputIcon, outputIcon };
}

const QuoteSummaryCore = ({ quote }: { quote: QuoteResponse }) => {
  const { t } = useTranslation();
  const { toggle, isExpanded, detailsId } = useCollapsibleCard();
  const { inputIcon, outputIcon } = useQuoteTokenIcons(quote);

  return (
    <>
      <div className="flex items-center">
        <TransactionId id={quote.id} />
      </div>
      <div className="mx-4 h-12 flex-grow border-gray-300 border-l" />
      <CurrencyExchange
        inputAmount={quote.inputAmount}
        inputCurrency={quote.inputCurrency}
        inputFallbackIcon={inputIcon.fallbackIconSrc}
        inputIcon={inputIcon.iconSrc}
        inputNetwork={inputIcon.network}
        outputAmount={quote.outputAmount}
        outputCurrency={quote.outputCurrency}
        outputFallbackIcon={outputIcon.fallbackIconSrc}
        outputIcon={outputIcon.iconSrc}
        outputNetwork={outputIcon.network}
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
  const { inputIcon, outputIcon } = useQuoteTokenIcons(quote);

  return (
    <section className="overflow-hidden">
      <div className="mb-4">
        <h3 className="mb-3 font-semibold text-gray-900">{t("components.quoteSummary.exchangeDetails")}</h3>
        <div className="grid grid-cols-2 gap-2 sm:gap-4">
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">{t("components.quoteSummary.youSend")}</div>
            <div className="flex items-center font-bold text-sm sm:text-base">
              <TokenIconWithNetwork
                className="mr-2 h-5 w-5"
                fallbackIconSrc={inputIcon.fallbackIconSrc}
                iconSrc={inputIcon.iconSrc}
                network={inputIcon.network}
                showNetworkOverlay={!!inputIcon.network}
                tokenSymbol={quote.inputCurrency}
              />
              {formatPrice(Big(quote.inputAmount))} {quote.inputCurrency.toUpperCase()}
            </div>
          </div>
          <div className="flex flex-col">
            <div className="text-gray-500 text-sm">{t("components.quoteSummary.youReceive")}</div>
            <div className="flex items-center font-bold text-sm sm:text-base">
              <TokenIconWithNetwork
                className="mr-2 h-5 w-5"
                fallbackIconSrc={outputIcon.fallbackIconSrc}
                iconSrc={outputIcon.iconSrc}
                network={outputIcon.network}
                showNetworkOverlay={!!outputIcon.network}
                tokenSymbol={quote.outputCurrency}
              />
              ~ {formatPrice(Big(quote.outputAmount))} {quote.outputCurrency.toUpperCase()}
            </div>
          </div>
        </div>
      </div>
      <TransactionId id={quote.id} label={t("components.quoteSummary.fullTransactionId")} variant="full" />
    </section>
  );
};

export const QuoteSummary = ({ quote, className }: QuoteSummaryProps) => {
  return (
    <div className={cn("absolute right-0 bottom-2 left-0 z-10", className)}>
      <CollapsibleCard>
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
