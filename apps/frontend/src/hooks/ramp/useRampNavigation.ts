import { ReactNode, useCallback, useMemo } from "react";
import { RampSearchParams } from "../../types/searchParams";
import { useRampComponentState } from "./useRampComponentState";

/**
 * Checks if all required URL parameters are present for automatic quote creation.
 * When these params are present, the Quote selection form should be skipped.
 *
 * Required params: cryptoLocked, fiat, inputAmount, network, rampType
 * These match the params checked in useRampUrlParams.ts for auto-creating a quote.
 */
export const hasAllQuoteRefreshParams = (params: RampSearchParams): boolean => {
  return Boolean(params.cryptoLocked && params.fiat && params.inputAmount && params.network && params.rampType);
};

export const useRampNavigation = (
  successComponent: ReactNode,
  failureComponent: ReactNode,
  progressComponent: ReactNode,
  formComponent: ReactNode,
  quoteComponent: ReactNode
) => {
  const { searchParams, rampState, rampMachineState } = useRampComponentState();

  const shouldSkipQuoteForm = useMemo(() => searchParams.quoteId || hasAllQuoteRefreshParams(searchParams), [searchParams]);

  const getCurrentComponent = useCallback(() => {
    if (shouldSkipQuoteForm) {
      return formComponent;
    }

    if (rampState?.ramp?.currentPhase === "complete") {
      return successComponent;
    }

    if (rampState?.ramp?.currentPhase === "failed") {
      return failureComponent;
    }

    if (rampState !== undefined && rampMachineState.value === "RampFollowUp") {
      return progressComponent;
    }

    if (rampMachineState.value === "Idle") {
      return quoteComponent;
    }

    return formComponent;
  }, [
    shouldSkipQuoteForm,
    rampState,
    formComponent,
    successComponent,
    failureComponent,
    progressComponent,
    rampMachineState.value,
    quoteComponent
  ]);

  return {
    currentPhase: rampState?.ramp?.currentPhase,
    getCurrentComponent,
    transactionId: rampState?.ramp?.id
  };
};
