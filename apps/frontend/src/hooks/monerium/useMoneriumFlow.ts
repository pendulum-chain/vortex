import { useEffect, useRef } from "react";
import { useMoneriumKycActor, useMoneriumKycSelector } from "../../contexts/rampState";

/**
 * Hook to manage Monerium's KYC state machine self-transitions for authentication flow.
 */
export const useMoneriumFlow = () => {
  const moneriumKycActor = useMoneriumKycActor();
  const moneriumState = useMoneriumKycSelector();

  const codeProcessedRef = useRef(false);

  useEffect(() => {
    if (!moneriumKycActor || !moneriumState || codeProcessedRef.current) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code && moneriumState.stateValue === "Redirect") {
      codeProcessedRef.current = true;
      moneriumKycActor.send({ code, type: "CODE_RECEIVED" });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [moneriumKycActor, moneriumState]);
};
