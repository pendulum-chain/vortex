import { motion } from "motion/react";
import { useCallback, useEffect } from "react";

import { useCircularProgressAnimation } from "../../hooks/quote/quote-refresh/useCircularProgressAnimation";
import { useQuoteRefreshData } from "../../hooks/quote/quote-refresh/useQuoteRefreshData";
import { useRefreshTimer } from "../../hooks/quote/quote-refresh/useRefreshTimer";

export function QuoteRefreshProgress() {
  const radius = 12;
  const strokeWidth = 2.4;
  const normalizedRadius = radius - strokeWidth * 2;
  const circumference = normalizedRadius * 2 * Math.PI;
  const strokeDasharray = `${circumference} ${circumference}`;

  const { shouldRefresh, performRefresh } = useQuoteRefreshData();
  const { timeRemaining, start, stop } = useRefreshTimer(30);
  const { animationControls, startAnimation, stopAnimation } = useCircularProgressAnimation(circumference);

  const handleRefreshComplete = useCallback(async () => {
    await performRefresh();
    startAnimation(30);
  }, [performRefresh, startAnimation]);

  const startRefreshCycle = useCallback(() => {
    startAnimation(30);
    start(handleRefreshComplete);
  }, [start, handleRefreshComplete, startAnimation]);

  // Effect to handle starting/stopping the refresh cycle
  useEffect(() => {
    if (shouldRefresh) {
      startRefreshCycle();
    } else {
      stop();
      stopAnimation();
    }
  }, [shouldRefresh, startRefreshCycle, stop, stopAnimation]);

  return (
    <div className="flex items-center justify-center gap-1">
      <div className="relative inline-block">
        <div
          className="tooltip tooltip-bottom tooltip-primary relative flex items-center justify-center"
          data-tip={`Quote will update in ${timeRemaining}s`}
        >
          <svg className="-rotate-90 transform" height={radius * 2} width={radius * 2}>
            <circle
              cx={radius}
              cy={radius}
              fill="transparent"
              r={normalizedRadius}
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            <motion.circle
              animate={animationControls}
              cx={radius}
              cy={radius}
              fill="transparent"
              initial={{ strokeDashoffset: circumference }}
              r={normalizedRadius}
              stroke="#3b82f6"
              strokeDasharray={strokeDasharray}
              strokeLinecap="round"
              strokeWidth={strokeWidth}
            />
          </svg>
        </div>
      </div>
    </div>
  );
}
