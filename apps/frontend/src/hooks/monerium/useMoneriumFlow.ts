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
      const parentSnapshot = rampActor.getSnapshot();
      const childSnapshot = moneriumKycActor.getSnapshot();

      const sanitizedParentContext = {
        ...parentSnapshot.context,
        assethubApiComponents: undefined,
        getMessageSignature: undefined,
        moonbeamApiComponents: undefined,
        pendulumApiComponents: undefined
      };

      const sanitizedChildContext = {
        ...childSnapshot.context,
        assethubApiComponents: undefined,
        getMessageSignature: undefined,
        moonbeamApiComponents: undefined,
        pendulumApiComponents: undefined
      };

      const stateToPersist = {
        children: {
          moneriumKyc: {
            context: sanitizedChildContext,
            value: childSnapshot.value
          }
        },
        context: sanitizedParentContext,
        value: parentSnapshot.value
      };

      try {
        const jsonString = JSON.stringify(stateToPersist);
        localStorage.setItem("moneriumKycState", jsonString);
        console.log("✅ Successfully saved sanitized state to localStorage.");

        effectHasRun.current = true;
        window.location.assign(authUrl);
      } catch (error) {
        console.error("❌ FAILED: Could not stringify the manually built state object.", error);
      }

      effectHasRun.current = true;
    }
  }, [redirectReady, authUrl, moneriumKycActor, rampActor]);
};
