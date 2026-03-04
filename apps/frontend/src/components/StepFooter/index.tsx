import { ReactNode } from "react";
import { cn } from "../../helpers/cn";
import { useQuote } from "../../stores/quote/useQuoteStore";
import { QuoteSummary } from "../QuoteSummary";

interface StepFooterProps {
  children?: ReactNode;
  className?: string;
}

export function StepFooter({ children, className }: StepFooterProps) {
  const quote = useQuote();
  const showAboveQuote = Boolean(quote);

  return (
    <>
      {children && (
        <div
          className={cn("absolute right-0 left-0 z-[5]", showAboveQuote ? "bottom-above-quote mb-4" : "bottom-2", className)}
        >
          {children}
        </div>
      )}
      <QuoteSummary />
    </>
  );
}
