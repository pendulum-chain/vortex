import { useInitializeFailedMessage } from '../../stores/rampStore';

export const RampErrorMessage = () => {
  const initializeFailedMessage = useInitializeFailedMessage();

  if (!initializeFailedMessage) {
    return null;
  }

  return (
    <section className="flex justify-center w-full mt-5">
      <div className="flex items-center gap-4">
        <p className="text-red-600">{initializeFailedMessage}</p>
      </div>
    </section>
  );
};
