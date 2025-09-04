import { useRampActor } from "../../../contexts/rampState";

export const useNavbarHandlers = () => {
  const rampActor = useRampActor();

  const handleLogoClick = () => {
    // Reset the ramp state and go back to the home page
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);
    rampActor.send({ type: "RESET_RAMP" });
  };

  const handleAPIClick = () => {
    window.open("https://api-docs.vortexfinance.co/", "_blank");
  };

  const handleWidgetClick = () => {
    // TODO: Define widget click handling later
    console.log("Widget clicked - handler to be implemented");
  };

  const handleDocsClick = () => {
    window.open("https://pendulum.gitbook.io/vortex", "_blank");
  };

  return {
    handleAPIClick,
    handleDocsClick,
    handleLogoClick,
    handleWidgetClick
  };
};
