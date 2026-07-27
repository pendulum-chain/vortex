import type { QuoteResponse } from "@vortexfi/shared";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuoteSummary } from "./QuoteSummary";

interface RefreshedQuoteReviewProps {
  quote: QuoteResponse;
  onConfirm: () => void;
}

export function RefreshedQuoteReview({ quote, onConfirm }: RefreshedQuoteReviewProps) {
  return (
    <div className="grid gap-4">
      <div className="flex items-start gap-3 rounded-lg border border-warning/40 bg-warning/5 p-4 text-sm">
        <RefreshCw className="mt-px size-4 shrink-0 text-warning" />
        <div className="grid gap-1">
          <p className="font-medium">Your quote was refreshed</p>
          <p className="text-muted-foreground">The previous quote was nearing expiration. Review the new amounts.</p>
        </div>
      </div>
      <div className="surface-raised grid grid-cols-2 gap-3 rounded-lg p-4 text-sm">
        <div>
          <p className="text-muted-foreground">You pay</p>
          <p className="font-semibold tabular-nums">
            {quote.inputAmount} {String(quote.inputCurrency)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-muted-foreground">You receive</p>
          <p className="font-semibold tabular-nums">
            {quote.outputAmount} {String(quote.outputCurrency)}
          </p>
        </div>
      </div>
      <QuoteSummary isFetching={false} quote={quote} />
      <Button onClick={onConfirm} size="lg" type="button">
        Accept refreshed quote
      </Button>
    </div>
  );
}
