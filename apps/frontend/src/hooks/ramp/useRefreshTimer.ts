import { useCallback, useEffect, useRef, useState } from "react";

interface UseRefreshTimerReturn {
  timeRemaining: number;
  isActive: boolean;
  start: (onComplete?: () => void) => void;
  stop: () => void;
  reset: () => void;
}

export const useRefreshTimer = (DEFAULT_DURATION: number): UseRefreshTimerReturn => {
  const [timeRemaining, setTimeRemaining] = useState(DEFAULT_DURATION);
  const [isActive, setIsActive] = useState(false);

  const intervalRef = useRef<NodeJS.Timeout | null>(null);
  const onCompleteCallbackRef = useRef<(() => void) | null>(null);

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const start = useCallback(
    (onComplete?: () => void) => {
      clearTimer();
      setIsActive(true);
      setTimeRemaining(DEFAULT_DURATION);
      onCompleteCallbackRef.current = onComplete || null;

      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            const callback = onCompleteCallbackRef.current;
            if (callback) {
              callback();
            }

            return DEFAULT_DURATION; // Reset for next cycle and continue
          }
          return newTime;
        });
      }, 1000);
    },
    [clearTimer, DEFAULT_DURATION]
  );

  const stop = useCallback(() => {
    setIsActive(false);
    clearTimer();
  }, [clearTimer]);

  const reset = useCallback(() => {
    setTimeRemaining(DEFAULT_DURATION);
    setIsActive(false);
    clearTimer();
  }, [clearTimer, DEFAULT_DURATION]);

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, [clearTimer]);

  return {
    isActive,
    reset,
    start,
    stop,
    timeRemaining
  };
};
