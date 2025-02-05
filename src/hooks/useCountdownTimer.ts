import { useEffect } from 'react';

export const useCountdownTimer = (
  remainingTime: number | null,
  setRemainingTime: (value: number | ((prev: number | null) => number | null)) => void,
) => {
  useEffect(() => {
    if (remainingTime === null) return;
    const timerId = setInterval(() => {
      setRemainingTime((prev) => (prev && prev > 0 ? prev - 1 : 0));
    }, 1000);
    return () => clearInterval(timerId);
  }, [remainingTime, setRemainingTime]);
};
