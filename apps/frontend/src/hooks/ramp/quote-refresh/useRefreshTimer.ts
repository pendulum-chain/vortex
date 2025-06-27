import { useCallback, useEffect, useRef, useState } from "react";

interface UseRefreshTimerReturn {
  timeRemaining: number;
  isActive: boolean;
  start: (onComplete?: () => void) => void;
  stop: () => void;
  reset: () => void;
}

export const useRefreshTimer = (duration: number = 30): UseRefreshTimerReturn => {
  const [timeRemaining, setTimeRemaining] = useState(duration);
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
      setTimeRemaining(duration);
      onCompleteCallbackRef.current = onComplete || null;

      intervalRef.current = setInterval(() => {
        setTimeRemaining(prev => {
          const newTime = prev - 1;
          if (newTime <= 0) {
            const callback = onCompleteCallbackRef.current;
            if (callback) {
              callback();
            }

            return duration; // Reset for next cycle and continue
          }
          return newTime;
        });
      }, 1000);
    },
    [clearTimer, duration]
  );

  const stop = useCallback(() => {
    setIsActive(false);
    clearTimer();
    onCompleteCallbackRef.current = null;
  }, [clearTimer]);

  const reset = useCallback(() => {
    setTimeRemaining(duration);
    setIsActive(false);
    clearTimer();
    onCompleteCallbackRef.current = null;
  }, [clearTimer, duration]);

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
