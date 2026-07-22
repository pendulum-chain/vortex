import { type QuoteResponse, RampDirection } from "@vortexfi/shared";
import { ChevronDown, Info, RefreshCw } from "lucide-react";
import { AnimatePresence, motion } from "motion/react";
import { useEffect, useState } from "react";
import { Progress } from "@/components/ui/progress";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/cn";
import { springSnappy } from "@/lib/motion";

const QUOTE_TTL_SECONDS = 60;

function useSecondsLeft(expiresAt: Date | string | undefined): number {
  const [now, setNow] = useState(() => Date.now());
  // External sync: tick once a second to drive the quote-expiry countdown.
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  if (!expiresAt) {
    return 0;
  }
  return Math.max(0, Math.round((new Date(expiresAt).getTime() - now) / 1000));
}

function formatRate(rate: number): string {
  return rate >= 1 ? rate.toFixed(2) : rate.toFixed(4);
}

interface QuoteSummaryProps {
  quote: QuoteResponse;
  isFetching: boolean;
}

export function QuoteSummary({ quote, isFetching }: QuoteSummaryProps) {
  const [open, setOpen] = useState(false);
  const secondsLeft = useSecondsLeft(quote.expiresAt);

  const input = Number(quote.inputAmount);
  const output = Number(quote.outputAmount);
  const discount = Number(quote.discountFiat ?? "0");
  const effectiveTotalFee = Number(quote.totalFeeFiat) - discount;
  const netRate = input > 0 ? output / input : 0;
  const fiat = quote.feeCurrency;
  const isOnramp = quote.rampType === RampDirection.BUY;
  const grossRate = isOnramp
    ? input - effectiveTotalFee > 0
      ? output / (input - effectiveTotalFee)
      : 0
    : input > 0
      ? (output + effectiveTotalFee) / input
      : 0;
  const inputCurrency = String(quote.inputCurrency);
  const outputCurrency = String(quote.outputCurrency);

  const feeItems: { label: string; tooltip: string; value: string }[] = [
    {
      label: "Processing fee",
      tooltip: isOnramp
        ? "Provider and Vortex fees for converting your fiat payment on-chain."
        : "Provider and Vortex fees for settling to the recipient's bank.",
      value: `${quote.processingFeeFiat} ${fiat}`
    }
  ];
  if (discount > 0) {
    feeItems.push({
      label: "Discount",
      tooltip: "A partner discount applied to this transfer.",
      value: `- ${quote.discountFiat} ${quote.discountCurrency ?? fiat}`
    });
  }
  if (Number(quote.networkFeeFiat) > 0) {
    feeItems.push({
      label: "Network fee",
      tooltip: "Blockchain gas to move the stablecoin on-chain.",
      value: `${quote.networkFeeFiat} ${fiat}`
    });
  }

  return (
    <div className="surface-raised grid gap-3 rounded-lg p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="text-muted-foreground text-sm">Rate</span>
        <div className="flex items-center gap-2">
          <RefreshCw className={cn("size-3.5 text-muted-foreground", isFetching && "animate-spin")} />
          <span className="font-medium text-sm tabular-nums">
            1 {inputCurrency} = {formatRate(grossRate)} {outputCurrency}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <Progress className="h-1 flex-1" value={(secondsLeft / QUOTE_TTL_SECONDS) * 100} />
        <span className="w-16 text-right text-muted-foreground text-xs tabular-nums">
          {isFetching ? "refreshing…" : `${secondsLeft}s`}
        </span>
      </div>

      <button
        className="-mx-1 flex items-center justify-between rounded px-1 py-1 text-sm hover:bg-muted/50"
        onClick={() => setOpen(value => !value)}
        type="button"
      >
        <span className="text-muted-foreground">Fee details</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>

      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            animate={{ height: "auto", opacity: 1 }}
            className="grid gap-2 overflow-hidden text-sm"
            exit={{ height: 0, opacity: 0 }}
            initial={{ height: 0, opacity: 0 }}
            transition={springSnappy}
          >
            {feeItems.map(item => (
              <div className="flex items-center justify-between" key={item.label}>
                <span className="flex items-center gap-1 text-muted-foreground">
                  {item.label}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Info className="size-3.5 cursor-help" />
                    </TooltipTrigger>
                    <TooltipContent>{item.tooltip}</TooltipContent>
                  </Tooltip>
                </span>
                <span className="tabular-nums">{item.value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between border-t pt-2">
              <span className="font-semibold">Total fee</span>
              <span className="font-semibold tabular-nums">
                {effectiveTotalFee.toFixed(2)} {fiat}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1 font-medium">
                Net rate
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Info className="size-3.5 cursor-help" />
                  </TooltipTrigger>
                  <TooltipContent>The all-in rate you get after every fee.</TooltipContent>
                </Tooltip>
              </span>
              <span className="font-medium tabular-nums">
                1 {inputCurrency} = {formatRate(netRate)} {outputCurrency}
              </span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
