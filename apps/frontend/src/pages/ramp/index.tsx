import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useRampActor, useStellarKycActor } from "../../contexts/rampState";
import { useToastMessage } from "../../helpers/notifications";
import { useMoneriumFlow } from "../../hooks/monerium/useMoneriumFlow";
import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { useSiweSignature } from "../../hooks/useSignChallenge";
import { useProvidedQuoteId, useQuote, useQuoteError } from "../../stores/quote/useQuoteStore";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { SuccessPage } from "../success";
import { WidgetDetailsPage } from "./widget";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(<SuccessPage />, <FailurePage />, <ProgressPage />, <WidgetDetailsPage />);
  const rampActor = useRampActor();
  const stellarKycActor = useStellarKycActor();
  useMoneriumFlow();
  useSiweSignature(stellarKycActor);

  const { showToast } = useToastMessage();

  const providedQuoteId = useProvidedQuoteId();
  const quote = useQuote();
  const quoteError = useQuoteError();
  const { executionInput } = useSelector(rampActor, state => ({
    executionInput: state.context.executionInput
  }));

  console.log("providedQuoteId:", providedQuoteId, "quote:", quote, "quoteError:", quoteError);

  useEffect(() => {
    // If the provided quote does not match the quote in the ramp actor, we need to update the quote in the ramp actor
    if (providedQuoteId && executionInput?.quote.id !== providedQuoteId) {
      console.log("Resetting ramp actor due to quote ID mismatch");
      rampActor.send({
        type: "RESET_RAMP"
      });
    }
  }, [providedQuoteId, executionInput?.quote.id, rampActor.send]);

  useEffect(() => {
    if (!providedQuoteId) {
      // No quote ID was provided. Navigate to the quote page
      window.location.href = "/";
    }

    if (providedQuoteId && !quote && quoteError?.toLowerCase().includes("notfound")) {
      // The quote expired. Navigate to the quote page with an error message
      console.log("The quote has expired. Please try again to get a new quote.");
      window.location.href = "/";
    }
  }, [providedQuoteId, quote, quoteError]);

  useEffect(() => {
    // How to restrict this to only send one notification?
    rampActor.on("SHOW_ERROR_TOAST", event => {
      showToast(event.message);
    });
  }, [rampActor, showToast]);

  const { state } = useSelector(rampActor, state => ({
    state: state.value
  }));

  console.log("Current Ramp State:", state);
  return getCurrentComponent();
};
