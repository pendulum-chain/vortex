import { useSelector } from "@xstate/react";
import { useRampActor } from "../../contexts/rampState";

export const RampErrorMessage = () => {
  const rampActor = useRampActor();
  const { initializeFailedMessage } = useSelector(rampActor, state => ({
    initializeFailedMessage: state.context.initializeFailedMessage
  }));

  if (!initializeFailedMessage) {
    return null;
  }

  return (
    <section className="mt-5 flex w-full justify-center">
      <div className="flex items-center gap-4">
        <p className="text-red-600">{initializeFailedMessage}</p>
      </div>
    </section>
  );
};
