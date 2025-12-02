import { useRampActor } from "../../../contexts/rampState";

export const useNavbarHandlers = () => {
  const rampActor = useRampActor();

  const resetRampAndNavigateHome = () => {
    const cleanUrl = window.location.origin;
    window.history.replaceState({}, "", cleanUrl);
    rampActor.send({ type: "RESET_RAMP" });
  };

  return {
    resetRampAndNavigateHome
  };
};
