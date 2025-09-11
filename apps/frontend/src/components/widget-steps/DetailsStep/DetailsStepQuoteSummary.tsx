import { QuoteResponse } from "@packages/shared";
import { QuoteSummary } from "../../QuoteSummary";

export interface DetailsStepQuoteSummaryProps {
  quote: QuoteResponse | undefined;
  className?: string;
}

export const DetailsStepQuoteSummary = ({ quote, className }: DetailsStepQuoteSummaryProps) => {
  if (!quote) return null;

  return (
    <div className={`mt-auto mb-2 ${className || ""}`}>
      <QuoteSummary quote={quote} />
    </div>
  );
};
