import { useAnimationControls } from "motion/react";
import { useCallback, useEffect } from "react";

import { useQuoteRefreshData } from "./useQuoteRefreshData";
import { useRefreshTimer } from "./useRefreshTimer";

interface UseQuoteRefreshReturn {
  timeRemaining: number;
  animationControls: ReturnType<typeof useAnimationControls>;
  isActive: boolean;
}

const DEFAULT_TIME_REMAINING = 30;

export const useQuoteRefresh = (circumference: number): UseQuoteRefreshReturn => {
  const animationControls = useAnimationControls();

  const { shouldRefresh, performRefresh } = useQuoteRefreshData();
  const { timeRemaining, isActive, start, stop } = useRefreshTimer(DEFAULT_TIME_REMAINING);

  const startNewAnimation = useCallback(() => {
    animationControls.set({ strokeDashoffset: circumference });
    animationControls.start({
      strokeDashoffset: 0,
      transition: { duration: DEFAULT_TIME_REMAINING, ease: "linear" }
    });
  }, [animationControls, circumference]);

  const handleRefreshComplete = useCallback(async () => {
    await performRefresh();
    startNewAnimation();
  }, [performRefresh, startNewAnimation]);

  const startRefreshCycle = useCallback(() => {
    startNewAnimation();
    start(handleRefreshComplete);
  }, [start, handleRefreshComplete, startNewAnimation]);

  // Effect to handle starting/stopping the refresh cycle
  useEffect(() => {
    if (shouldRefresh) {
      startRefreshCycle();
    } else {
      stop();
      animationControls.stop();
    }
  }, [shouldRefresh, startRefreshCycle, stop, animationControls]);

  return {
    animationControls,
    isActive: shouldRefresh && isActive,
    timeRemaining
  };
};
