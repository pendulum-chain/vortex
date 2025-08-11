import { useEffect, useRef } from "react";
import { useMoneriumKycActor, useMoneriumKycSelector, useRampActor } from "../../contexts/rampState";

/**
 * Hook to manage Monerium authentication flow state and handle redirects
 */
export const useMoneriumFlow = () => {
  const moneriumKycActor = useMoneriumKycActor();
  const moneriumKycData = useMoneriumKycSelector();
  const rampActor = useRampActor();
  const effectHasRun = useRef(false);

  const { redirectReady, authUrl } = moneriumKycData?.context || {};

  useEffect(() => {
    if (!moneriumKycActor || !rampActor) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      moneriumKycActor.send({ code, type: "CODE_RECEIVED" });
      localStorage.removeItem("moneriumKycState");
      window.history.replaceState({}, document.title, window.location.pathname);
      return;
    }

    if (redirectReady && authUrl && !effectHasRun.current) {
      try {
        const parentSnapshot = rampActor.getPersistedSnapshot();
      } catch (error) {
        console.error("❌ FAILED: The sanitized parent snapshot still failed to serialize.", error);
      }

      //window.location.assign(authUrl);
      effectHasRun.current = true;
    }
  }, [redirectReady, authUrl, moneriumKycActor, rampActor]);
};
