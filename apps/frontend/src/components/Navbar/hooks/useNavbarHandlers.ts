import { useParams, useRouter } from "@tanstack/react-router";
import { useRampActor } from "../../../contexts/rampState";

export const useNavbarHandlers = () => {
  const rampActor = useRampActor();
  const router = useRouter();
  const params = useParams({ strict: false });

  const resetRampAndNavigateHome = () => {
    rampActor.send({ type: "RESET_RAMP" });

    router.navigate({
      params: params,
      replace: true,
      search: {},
      to: "/{-$locale}"
    });
  };

  return {
    resetRampAndNavigateHome
  };
};
