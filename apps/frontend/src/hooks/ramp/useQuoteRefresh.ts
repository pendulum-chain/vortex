import Big from "big.js";
import { useCallback, useEffect, useRef, useState } from "react";

import { RampDirection } from "../../components/RampToggle";
import { useNetwork } from "../../contexts/network";
import { usePartnerId } from "../../stores/partnerStore";
import { useQuote, useQuoteStore } from "../../stores/ramp/useQuoteStore";
import { useFiatToken, useInputAmount, useOnChainToken } from "../../stores/ramp/useRampFormStore";
import { useRampDirection } from "../../stores/rampDirectionStore";

interface UseQuoteRefreshReturn {
  progress: number; // 0-100
  isActive: boolean;
  timeRemaining: number;
  reset: () => void;
  pause: () => void;
  resume: () => void;
}

const REFRESH_INTERVAL_MS = 30000; // 30 seconds
const PROGRESS_UPDATE_INTERVAL_MS = 100; // Update progress every 100ms for smooth animation

export const useQuoteRefresh = (): UseQuoteRefreshReturn => {
  const [progress, setProgress] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const [startTime, setStartTime] = useState<number | null>(null);

  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const refreshTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const quote = useQuote();
  const inputAmount = useInputAmount();
  const onChainToken = useOnChainToken();
  const fiatToken = useFiatToken();
  const { selectedNetwork } = useNetwork();
  const rampDirection = useRampDirection();
  const partnerId = usePartnerId();
  const { fetchQuote } = useQuoteStore();

  // Check if we have a valid quote to refresh
  const hasValidQuote = Boolean(quote && inputAmount && onChainToken && fiatToken);
  const rampType = rampDirection === RampDirection.ONRAMP ? "on" : "off";

  // Calculate time remaining in seconds
  const timeRemaining = Math.ceil((REFRESH_INTERVAL_MS - (progress * REFRESH_INTERVAL_MS) / 100) / 1000);

  // Clear all timers
  const clearTimers = useCallback(() => {
    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current);
      progressIntervalRef.current = null;
    }
    if (refreshTimeoutRef.current) {
      clearTimeout(refreshTimeoutRef.current);
      refreshTimeoutRef.current = null;
    }
  }, []);

  // Reset the timer and progress
  const reset = useCallback(() => {
    clearTimers();
    setProgress(0);
    setStartTime(Date.now());
    setIsPaused(false);
  }, [clearTimers]);

  // Pause the timer
  const pause = useCallback(() => {
    setIsPaused(true);
    clearTimers();
  }, [clearTimers]);

  // Resume the timer
  const resume = useCallback(() => {
    if (hasValidQuote) {
      setIsPaused(false);
      setStartTime(Date.now() - (progress * REFRESH_INTERVAL_MS) / 100);
    }
  }, [hasValidQuote, progress]);

  // Perform the quote refresh
  const performRefresh = useCallback(async () => {
    if (!hasValidQuote || !inputAmount) return;

    try {
      // Use the same parameters as the original quote
      await fetchQuote({
        fiatToken,
        inputAmount: Big(inputAmount),
        onChainToken,
        partnerId: partnerId === null ? undefined : partnerId,
        rampType,
        selectedNetwork
      });
    } catch (error) {
      console.error("Failed to refresh quote:", error);
    }

    // Reset the timer after refresh
    reset();
  }, [hasValidQuote, inputAmount, onChainToken, fiatToken, selectedNetwork, rampType, partnerId, fetchQuote, reset]);

  // Start or restart the refresh cycle
  const startRefreshCycle = useCallback(() => {
    if (!hasValidQuote || isPaused) return;

    clearTimers();
    setStartTime(Date.now());

    // Set up progress updates
    progressIntervalRef.current = setInterval(() => {
      if (!startTime) return;

      const elapsed = Date.now() - startTime;
      const newProgress = Math.min((elapsed / REFRESH_INTERVAL_MS) * 100, 100);

      setProgress(newProgress);

      // If we've reached 100%, trigger refresh
      if (newProgress >= 100) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current);
          progressIntervalRef.current = null;
        }
        performRefresh();
      }
    }, PROGRESS_UPDATE_INTERVAL_MS);

    // Set up the refresh timeout as a backup
    refreshTimeoutRef.current = setTimeout(() => {
      performRefresh();
    }, REFRESH_INTERVAL_MS);
  }, [hasValidQuote, isPaused, startTime, performRefresh, clearTimers]);

  // Effect to handle starting/stopping the refresh cycle
  useEffect(() => {
    if (hasValidQuote && !isPaused) {
      startRefreshCycle();
    } else {
      pause();
    }

    return () => {
      clearTimers();
    };
  }, [hasValidQuote, isPaused, startRefreshCycle, pause, clearTimers]);

  // Reset when input parameters change (manual input)
  useEffect(() => {
    reset();
  }, [reset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearTimers();
    };
  }, [clearTimers]);

  return {
    isActive: hasValidQuote && !isPaused,
    pause,
    progress,
    reset,
    resume,
    timeRemaining
  };
};
