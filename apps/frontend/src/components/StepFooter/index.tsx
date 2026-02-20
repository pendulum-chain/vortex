import { QuoteResponse } from "@vortexfi/shared";
import { ReactNode } from "react";
import { cn } from "../../helpers/cn";
import { QuoteSummary } from "../QuoteSummary";

interface StepFooterProps {
  quote?: QuoteResponse;
  aboveQuote?: boolean;
  children?: ReactNode;
  className?: string;
}

export function StepFooter({ quote, aboveQuote, children, className }: StepFooterProps) {
  const showAboveQuote = !!quote || aboveQuote;
  return (
    <>
      {children && (
        <div
          className={cn("absolute right-0 left-0 z-[5]", showAboveQuote ? "bottom-above-quote mb-4" : "bottom-2", className)}
        >
          {children}
        </div>
      )}
      {quote && <QuoteSummary quote={quote} />}
    </>
  );
}
