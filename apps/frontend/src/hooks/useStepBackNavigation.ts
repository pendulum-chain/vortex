import { useNavigate } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { useAveniaKycActor, useAveniaKycSelector, useRampActor } from "../contexts/rampState";

export const useStepBackNavigation = () => {
  const navigate = useNavigate();
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  const rampState = useSelector(rampActor, state => state.value);
  const enteredViaForm = useSelector(rampActor, state => state.context.enteredViaForm);

  // Hide back button when in RampFollowUp/RedirectCallback, or when in QuoteReady but user entered via URL (not form)
  const shouldHide =
    rampState === "RampFollowUp" || rampState === "RedirectCallback" || (rampState === "QuoteReady" && !enteredViaForm);

  const handleBack = () => {
    if (aveniaKycActor && aveniaState) {
      const childState = aveniaState.stateValue;
      if (childState === "DocumentUpload") {
        aveniaKycActor.send({ type: "DOCUMENTS_BACK" });
        return;
      }
      if (childState === "LivenessCheck") {
        aveniaKycActor.send({ type: "GO_BACK" });
        return;
      }
      if (typeof childState === "object" && childState !== null && "KYBFlow" in childState) {
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
