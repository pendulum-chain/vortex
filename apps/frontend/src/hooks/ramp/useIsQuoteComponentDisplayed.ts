import { useRampComponentState } from "./useRampComponentState";
import { hasAllQuoteRefreshParams } from "./useRampNavigation";

/**
 * Hook to determine if the Quote component is currently displayed in the Ramp page.
 * Mirrors the logic from useRampNavigation to check if quoteComponent would be returned.
 */
export const useIsQuoteComponentDisplayed = (): boolean => {
  const { searchParams, rampState, rampMachineState } = useRampComponentState();

  // Quote is NOT shown if quoteId exists in URL or all quote refresh params are present
  if (searchParams.quoteId || hasAllQuoteRefreshParams(searchParams)) {
    return false;
  }

  // Quote is NOT shown if in complete phase (shows success)
  if (rampState?.ramp?.currentPhase === "complete") {
    return false;
  }

  // Quote is NOT shown if in failed phase (shows failure)
  if (rampState?.ramp?.currentPhase === "failed") {
    return false;
  }

  if (rampState === undefined && rampMachineState.value === "Idle") {
    return true;
  }

  return false;
};
