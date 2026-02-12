import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { useEffect, useRef } from "react";
import { useAveniaKycActor, useAveniaKycSelector, useRampActor } from "../contexts/rampState";

export const useStepBackNavigation = () => {
  const navigate = useNavigate();
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();

  const rampState = useSelector(rampActor, state => state.value);
  const enteredViaForm = useSelector(rampActor, state => state.context.enteredViaForm);

  const searchParams = useSearch({ strict: false });
  const isExternalProviderEntry = !!searchParams.externalSessionId;
  const hasQuoteIdInUrl = !!searchParams.quoteId;
  const prevHasQuoteIdRef = useRef(hasQuoteIdInUrl);
  const isAuthStep =
    rampState === "CheckAuth" ||
    rampState === "EnterEmail" ||
    rampState === "CheckingEmail" ||
    rampState === "RequestingOTP" ||
    rampState === "EnterOTP" ||
    rampState === "VerifyingOTP";

  // When quoteId is removed from URL while in QuoteReady (and user entered via form),
  // send GO_BACK to return to Idle/Quote form.
  useEffect(() => {
    const quoteIdWasRemoved = prevHasQuoteIdRef.current && !hasQuoteIdInUrl;
    prevHasQuoteIdRef.current = hasQuoteIdInUrl;

    if (quoteIdWasRemoved && rampState === "QuoteReady" && enteredViaForm) {
      rampActor.send({ type: "GO_BACK" });
    }
  }, [rampActor, hasQuoteIdInUrl, rampState, enteredViaForm]);

  const shouldHide =
    rampState === "RampFollowUp" ||
    rampState === "RedirectCallback" ||
    isExternalProviderEntry ||
    (rampState === "QuoteReady" && !enteredViaForm);

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

    if (isQuoteReady || isIdle || isAuthStep) {
      navigate({ replace: true, search: {}, to: "." });
    }

    rampActor.send({ type: "GO_BACK" });
  };

  return { handleBack, shouldHide };
};
