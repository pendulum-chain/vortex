import { InformationCircleIcon } from "@heroicons/react/20/solid";
import { useQuoteRefresh } from "../../hooks/ramp/useQuoteRefresh";

export function QuoteRefreshProgress() {
  const { progress, timeRemaining, isActive } = useQuoteRefresh();

  return (
    <div className="flex items-center justify-center gap-1">
      <progress
        className={`progress w-10 transition-all duration-100 ${isActive ? "progress-primary" : "progress-neutral"}`}
        max="100"
        value={progress}
      ></progress>
      <div
        className="tooltip tooltip-primary tooltip-bottom tooltip-sm"
        data-tip={isActive ? `Refreshing in ${timeRemaining}s` : "Quote refresh paused"}
      >
        <InformationCircleIcon className="ml-1 h-4 w-4 hover:text-primary" />
      </div>
    </div>
  );
}
