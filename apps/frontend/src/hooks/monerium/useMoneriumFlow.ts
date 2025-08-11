import { useEffect, useRef } from "react";
import { useMoneriumKycActor, useMoneriumKycSelector, useRampActor } from "../../contexts/rampState";

/**
 * Hook to manage Monerium's KYC state machine self-transitions for authentication flow.
 */
export const useMoneriumFlow = () => {
  const moneriumKycActor = useMoneriumKycActor();
  const rampActor = useRampActor();
  const moneriumState = useMoneriumKycSelector();
  const redirectedRef = useRef(false);

  // Effect to handle redirection to Monerium authentication
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (!moneriumKycActor || !rampActor || !moneriumState || redirectedRef.current || code) {
      return;
    }
    if (moneriumState.stateValue === "Redirect") {
      const { authUrl } = moneriumState.context;
      if (authUrl) {
        redirectedRef.current = true;

        const persistedSnapshot = rampActor.getPersistedSnapshot();

        try {
          const jsonString = JSON.stringify(persistedSnapshot);
          localStorage.setItem("moneriumKycState", jsonString);
          window.location.assign(authUrl);
        } catch (error) {
          console.error("Failed to save state and redirect", error);
        }
      }
    }
  }, [moneriumKycActor, rampActor, moneriumState]);

  const codeProcessedRef = useRef(false);
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    if (!moneriumKycActor || codeProcessedRef.current || !code) {
      return;
    }

    codeProcessedRef.current = true;
    moneriumKycActor.send({ code, type: "CODE_RECEIVED" });
    window.history.replaceState({}, document.title, window.location.pathname);
  }, [moneriumKycActor]);
};
