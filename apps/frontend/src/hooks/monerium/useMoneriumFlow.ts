import { useEffect, useRef } from "react";
import { useMoneriumKycActor, useMoneriumKycSelector, useRampActor } from "../../contexts/rampState";

/**
 * Hook to manage Monerium's KYC state machine self-transitions for authentication flow.
 */
export const useMoneriumFlow = () => {
  const moneriumKycActor = useMoneriumKycActor();
  const moneriumState = useMoneriumKycSelector();

  const codeProcessedRef = useRef(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (moneriumState && !code && moneriumState.stateValue === "Redirect") {
      const { authUrl } = moneriumState.context;
      if (!authUrl) {
        return;
      }
      window.location.assign(authUrl);
    }
    if (!moneriumKycActor || codeProcessedRef.current || !code) {
      return;
    }

    codeProcessedRef.current = true;
    moneriumKycActor.send({ code, type: "CODE_RECEIVED" });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [moneriumKycActor, moneriumState]);
};
