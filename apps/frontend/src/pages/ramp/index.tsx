import { useRampNavigation } from "../../hooks/ramp/useRampNavigation";
import { FailurePage } from "../failure";
import { ProgressPage } from "../progress";
import { RampForm } from "../ramp-form";
import { SuccessPage } from "../success";
import { WidgetDetailsPage } from "../widget";

export const Ramp = () => {
  const { getCurrentComponent } = useRampNavigation(
    <SuccessPage />,
    <FailurePage />,
    <ProgressPage />,
    <RampForm />,
    <WidgetDetailsPage />
  );

  return getCurrentComponent();
};
