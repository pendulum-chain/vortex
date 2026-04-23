import { ReactNode, useCallback, useEffect } from "react";
import { useIsQuoteComponentDisplayed } from "./useIsQuoteComponentDisplayed";
import { useRampComponentState } from "./useRampComponentState";

function getActiveScreen(
  currentPhase: string | undefined,
  rampStateDefined: boolean,
  machineValue: string,
  isQuoteDisplayed: boolean
): string {
  if (currentPhase === "complete") return "success";
  if (currentPhase === "failed") return "failure";
  if (rampStateDefined && machineValue === "RampFollowUp") return "progress";
  if (isQuoteDisplayed) return "quote";
  return "form";
}

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  quoteComponent: ReactNode
) => {
  const { rampState, rampMachineState } = useRampComponentState();
  const isQuoteDisplayed = useIsQuoteComponentDisplayed();

  const activeScreen = getActiveScreen(
    rampState?.ramp?.currentPhase,
    rampState !== undefined,
    String(rampMachineState.value),
    isQuoteDisplayed
  );

  useEffect(() => {
    console.log("activeScreen", activeScreen);
    window.scrollTo({ behavior: "instant", top: 0 });
  }, [activeScreen]);

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === "failed") {
      return failureComponent;
    }

    if (rampState !== undefined && rampMachineState.value === "RampFollowUp") {
      return progressComponent;
    }

    if (isQuoteDisplayed) {
      return quoteComponent;
    }

    return formComponent;
  }, [
    rampState,
    rampMachineState.value,
    successComponent,
    failureComponent,
    progressComponent,
    formComponent,
    quoteComponent,
    isQuoteDisplayed
  ]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
