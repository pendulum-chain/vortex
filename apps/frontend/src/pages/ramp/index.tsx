import { useSelector } from "@xstate/react";
import { useRampActor } from "../../contexts/rampState";
import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { RampForm } from "../ramp-form";
import { SuccessPage } from "../success";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(<SuccessPage />, <FailurePage />, <ProgressPage />, <RampForm />);
  const rampActor = useRampActor();

  const { state } = useSelector(rampActor, state => ({
    state: state.value
  }));

  console.log("Current Ramp State:", state);
  return getCurrentComponent();
};
