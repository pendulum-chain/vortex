import { useParams, useRouter } from "@tanstack/react-router";
import { useRampActor } from "../../../contexts/rampState";

export const useNavbarHandlers = () => {
  const rampActor = useRampActor();
  const router = useRouter();
  const params = useParams({ strict: false });

  const resetRampAndNavigateHome = () => {
    rampActor.send({ type: "RESET_RAMP" });

    // Check if currently on widget route - if so, stay on widget to restart the flow
    const isOnWidget = router.state.location.pathname.includes("/widget");

    router.navigate({
      params: params,
      replace: true,
      search: {},
      to: isOnWidget ? "/{-$locale}/widget" : "/{-$locale}"
    });
  };

  return {
    resetRampAndNavigateHome
  };
};
