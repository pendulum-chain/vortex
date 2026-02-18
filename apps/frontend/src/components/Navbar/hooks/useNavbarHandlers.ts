import { useParams, useRouter } from "@tanstack/react-router";
import { useRampActor } from "../../../contexts/rampState";
import { useWidgetMode } from "../../../hooks/useWidgetMode";

export const useNavbarHandlers = () => {
  const rampActor = useRampActor();
  const router = useRouter();
  const params = useParams({ strict: false });
  const isWidgetMode = useWidgetMode();

  const resetRampAndNavigateHome = () => {
    rampActor.send({ skipUrlCleaner: true, type: "RESET_RAMP" });

    router.navigate({
      params: params,
      replace: true,
      search: {},
      to: isWidgetMode ? "/{-$locale}/widget" : "/{-$locale}"
    });
  };

  return {
    resetRampAndNavigateHome
  };
};
