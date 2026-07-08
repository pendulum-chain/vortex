import { useNavigate, useSearch } from "@tanstack/react-router";
import { useSelector } from "@xstate/react";
import { useEffect, useRef } from "react";
import { useFiatAccountActor, useFiatAccountSelector } from "../contexts/FiatAccountMachineContext";
import {
  useAlfredpayKycActor,
  useAlfredpayKycSelector,
  useAveniaKycActor,
  useAveniaKycSelector,
  useRampActor
} from "../contexts/rampState";
import { isInCompoundState } from "../machines/types";

export const useStepBackNavigation = () => {
  const navigate = useNavigate();
  const rampActor = useRampActor();
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const alfredpayKycActor = useAlfredpayKycActor();
  const alfredpayKycState = useAlfredpayKycSelector();
  const fiatAccountActor = useFiatAccountActor();
  const showFiatAccountRegistration = useFiatAccountSelector(s => s.matches("Open"));

  const rampState = useSelector(rampActor, state => state.value);
  const enteredViaForm = useSelector(rampActor, state => state.context.enteredViaForm);
  const regionLocked = useSelector(rampActor, state => !!state.context.kybLink?.regionLocked);

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

  // With `?kybLocked=` the region selector is skipped, so the first KYB screen has nothing to go back to
  // (the parent KYC `GO_BACK` is a guarded no-op when locked). Deeper KYB steps that own their back
  // navigation — the same ones `handleBack` forwards to the child machine — keep the button.
  const isKybInternalBackStep =
    (!!aveniaState &&
      (aveniaState.stateValue === "DocumentUpload" ||
        aveniaState.stateValue === "LivenessCheck" ||
        isInCompoundState(aveniaState.stateValue, "KYBFlow"))) ||
    (!!alfredpayKycState && alfredpayKycState.stateValue === "UploadingDocuments");
  const hideForLockedKyb = regionLocked && isInCompoundState(rampState, "KYC") && !isKybInternalBackStep;

  const shouldHide =
    rampState === "RampFollowUp" ||
    rampState === "RedirectCallback" ||
    // The region selector is the root of the KYB deep-link flow — there is nothing to go back to.
    rampState === "SelectRegion" ||
    hideForLockedKyb ||
    isExternalProviderEntry ||
    (rampState === "QuoteReady" && !enteredViaForm);

  const handleBack = () => {
    if (showFiatAccountRegistration) {
      fiatAccountActor.send({ type: "GO_BACK" });
      return;
    }

    if (alfredpayKycActor && alfredpayKycState) {
      if (alfredpayKycState.stateValue === "UploadingDocuments") {
        alfredpayKycActor.send({ type: "GO_BACK" });
        return;
      }
    }

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
      if (isInCompoundState(childState, "KYBFlow")) {
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
