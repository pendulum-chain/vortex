import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useRampActor, useStellarKycActor } from "../../contexts/rampState";
import { useToastMessage } from "../../helpers/notifications";
import { useMoneriumFlow } from "../../hooks/monerium/useMoneriumFlow";
import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { useAuthTokens } from "../../hooks/useAuthTokens";
import { useSiweSignature } from "../../hooks/useSignChallenge";
import { useQuote, useQuoteActions } from "../../stores/quote/useQuoteStore";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { Quote } from "../quote";
import { SuccessPage } from "../success";
import { Widget } from "../widget";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(<SuccessPage />, <FailurePage />, <ProgressPage />, <Widget />, <Quote />);
  const rampActor = useRampActor();
  const stellarKycActor = useStellarKycActor();
  const quote = useQuote();
  const { forceSetQuote } = useQuoteActions();
  useMoneriumFlow();
  useSiweSignature(stellarKycActor);
  useAuthTokens(rampActor);

  const { showToast } = useToastMessage();

  useEffect(() => {
    // How to restrict this to only send one notification?
    rampActor.on("SHOW_ERROR_TOAST", event => {
      showToast(event.message);
    });
  }, [rampActor, showToast]);

  const { state, quoteFromState } = useSelector(rampActor, state => ({
    quoteFromState: state.context.quote,
    state: state.value
  }));

  useEffect(() => {
    if (quoteFromState && quote !== quoteFromState) {
      forceSetQuote(quoteFromState);
    }
  }, [quote, quoteFromState, forceSetQuote]);

  useEffect(() => {
    if (!quoteFromState && quote && state === "QuoteReady") {
      rampActor.send({ quote, type: "UPDATE_QUOTE" });
    }
  }, [quote, quoteFromState, state, rampActor]);

  console.log("Debug: Current Ramp State:", state);
  return getCurrentComponent();
};
