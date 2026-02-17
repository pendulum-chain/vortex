import { RampSearchParams } from "./../../types/searchParams";
import { useRampComponentState } from "./useRampComponentState";

function isExternalFlow(params: RampSearchParams): boolean {
  return !!params.externalSessionId;
}

/**
 * Hook to determine if the Quote component is currently displayed in the Ramp page.
 * Mirrors the logic from useRampNavigation to check if quoteComponent would be returned.
 */
export const useIsQuoteComponentDisplayed = (): boolean => {
  const { rampState, rampMachineState, searchParams } = useRampComponentState();

  if (rampState?.ramp?.currentPhase === "complete") {
    return false;
  }

  if (rampState?.ramp?.currentPhase === "failed") {
    return false;
  }

  // Automatic Quote Refresh Ramp
  if (isExternalFlow(searchParams) && (rampMachineState.value === "LoadingQuote" || rampMachineState.value === "QuoteReady")) {
    return false;
  }

  if (
    (rampMachineState.value === "Idle" ||
      rampMachineState.value === "LoadingQuote" ||
      rampMachineState.value === "QuoteReady") &&
    !searchParams.quoteId
  ) {
    return true;
  }

  return false;
};
