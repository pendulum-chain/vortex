import { useRampComponentState } from "./useRampComponentState";

/**
 * Hook to determine if the Quote component is currently displayed in the Ramp page.
 * Mirrors the logic from useRampNavigation to check if quoteComponent would be returned.
 */
export const useIsQuoteComponentDisplayed = (): boolean => {
  const { searchParams, rampState, rampMachineState } = useRampComponentState();

  // Quote is NOT shown if quoteId exists in URL (shows form instead)
  if (searchParams.quoteId) {
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

  // Quote is NOT shown if in RampFollowUp state (shows progress)
  if (rampState !== undefined && rampMachineState.value === "RampFollowUp") {
    return false;
  }

  // Quote is NOT shown if in Idle state (shows form)
  if (rampState !== undefined && rampMachineState.value === "Idle") {
    return false;
  }

  return true;
};
