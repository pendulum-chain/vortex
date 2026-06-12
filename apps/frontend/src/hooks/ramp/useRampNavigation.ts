import { TransactionStatus } from "@vortexfi/shared";
import { ReactNode, useCallback, useLayoutEffect } from "react";
import { useIsQuoteComponentDisplayed } from "./useIsQuoteComponentDisplayed";
import { useRampComponentState } from "./useRampComponentState";

function getActiveScreen(
  currentPhase: string | undefined,
  status: TransactionStatus | undefined,
  rampStateDefined: boolean,
  machineValue: string,
  isQuoteDisplayed: boolean
): string {
  if (status === TransactionStatus.COMPLETE || currentPhase === "complete") return "success";
  if (status === TransactionStatus.FAILED || currentPhase === "failed") return "failure";
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
    rampState?.ramp?.status,
    rampState !== undefined,
    String(rampMachineState.value),
    isQuoteDisplayed
  );

  useLayoutEffect(() => {
    if (activeScreen === "progress" || activeScreen === "success" || activeScreen === "failure") {
      window.scrollTo({ behavior: "instant", top: 0 });
    }
  }, [activeScreen]);

  const getCurrentComponent = useCallback(() => {
    if (rampState?.ramp?.status === TransactionStatus.COMPLETE || rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.status === TransactionStatus.FAILED || rampState?.ramp?.currentPhase === "failed") {
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
