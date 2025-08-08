import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useRampActor } from "../../contexts/rampState";
import { moneriumKycMachine } from "../../machines/moneriumKyc.machine";

/**
 * Hook to manage Monerium authentication flow state and handle redirects
 */
export const useMoneriumFlow = () => {
  const rampActor = useRampActor();
  const moneriumActor = useSelector(rampActor, (snapshot: any) => (snapshot.children as any).moneriumKyc);

  useEffect(() => {
    if (!moneriumActor) {
      return;
    }

    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");

    if (code) {
      moneriumActor.send({ code, type: "CODE_RECEIVED" });
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, [moneriumActor]);
};
