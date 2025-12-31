import { useRouter, useRouterState } from "@tanstack/react-router";
import { useEffect, useRef } from "react";
import { useMoneriumKycActor, useMoneriumKycSelector } from "../../contexts/rampState";

/**
 * Hook to manage Monerium's KYC state machine self-transitions for authentication flow.
 */
export const useMoneriumFlow = () => {
  const moneriumKycActor = useMoneriumKycActor();
  const moneriumState = useMoneriumKycSelector();
  const router = useRouter();
  const routerState = useRouterState();

  const codeProcessedRef = useRef(false);

  useEffect(() => {
    if (!moneriumKycActor || !moneriumState || codeProcessedRef.current) {
      return;
    }

    const searchParams = routerState.location.search as { code?: string };
    const code = searchParams?.code;

    if (code && moneriumState.stateValue === "Redirect") {
      codeProcessedRef.current = true;
      moneriumKycActor.send({ code, type: "CODE_RECEIVED" });
      // Remove the code parameter from URL
      router.navigate({
        replace: true,
        search: {},
        to: routerState.location.pathname
      });
    }
  }, [moneriumKycActor, moneriumState, router, routerState]);
};
