import { useSelector } from "@xstate/react";
import { useEffect } from "react";
import { useRampActor } from "../../contexts/rampState";
import { useToastMessage } from "../../helpers/notifications";
import { useMoneriumFlow } from "../../hooks/monerium/useMoneriumFlow";
import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { RampForm } from "../ramp-form";
import { SuccessPage } from "../success";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(<SuccessPage />, <FailurePage />, <ProgressPage />, <RampForm />);
  const rampActor = useRampActor();
  useMoneriumFlow();

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

  console.log("Current Ramp State:", state);
  return getCurrentComponent();
};
