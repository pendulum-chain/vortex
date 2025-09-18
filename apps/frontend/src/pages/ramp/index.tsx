import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useRampActor, useStellarKycActor } from "../../contexts/rampState";
import { useToastMessage } from "../../helpers/notifications";
import { useMoneriumFlow } from "../../hooks/monerium/useMoneriumFlow";
import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { useSiweSignature } from "../../hooks/useSignChallenge";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { SuccessPage } from "../success";
import { Widget } from "../widget";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(<SuccessPage />, <FailurePage />, <ProgressPage />, <Widget />);
  const rampActor = useRampActor();
  const stellarKycActor = useStellarKycActor();
  useMoneriumFlow();
  useSiweSignature(stellarKycActor);

  const { showToast } = useToastMessage();

  useEffect(() => {
    // How to restrict this to only send one notification?
    rampActor.on("SHOW_ERROR_TOAST", event => {
      showToast(event.message);
    });
  }, [rampActor, showToast]);

  const { state } = useSelector(rampActor, state => ({
    state: state.value
  }));

  console.log("Debug: Current Ramp State:", state);
  return getCurrentComponent();
};
