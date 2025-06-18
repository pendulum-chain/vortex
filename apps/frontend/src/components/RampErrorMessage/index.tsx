import { useInitializeFailedMessage } from "../../stores/rampStore";

export const RampErrorMessage = () => {
  const initializeFailedMessage = useInitializeFailedMessage();

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
