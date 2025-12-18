import { useNavigate, useParams } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { useAveniaKycActor, useAveniaKycSelector, useRampActor } from "../contexts/rampState";

export const useStepBackNavigation = () => {
  const navigate = useNavigate();
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  const rampState = useSelector(rampActor, state => state.value);

  const shouldHide = rampState === "RampFollowUp" || rampState === "RedirectCallback";

  const handleBack = () => {
    if (aveniaKycActor && aveniaState) {
      const childState = aveniaState.stateValue;
      const childHandledStates = ["DocumentUpload", "LivenessCheck", "KYBFlow"];
      if (childHandledStates.includes(childState as string)) {
        aveniaKycActor.send({ type: "GO_BACK" });
        return;
      }
    }

    const isQuoteReady = rampState === "QuoteReady";
    const isIdle = rampState === "Idle";

    if (isQuoteReady || isIdle) {
      navigate({ replace: true, search: {}, to: "." });
    }

    rampActor.send({ type: "GO_BACK" });
  };

  return { handleBack, shouldHide };
};
