import { ReactNode } from "react";
import { cn } from "../../helpers/cn";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { QuoteSummary } from "../QuoteSummary";

interface StepFooterProps {
  children?: ReactNode;
  className?: string;
  hideQuoteSummary?: boolean;
}

export function StepFooter({ children, className, hideQuoteSummary = false }: StepFooterProps) {
  const quote = useQuote();
  const showAboveQuote = hideQuoteSummary ? false : Boolean(quote);

  return (
    <>
      {children && (
        <div
          className={cn("absolute right-0 left-0 z-footer", showAboveQuote ? "bottom-above-quote mb-4" : "bottom-2", className)}
        >
          {children}
        </div>
      )}
      {hideQuoteSummary ? <></> : <QuoteSummary />}
    </>
  );
}
