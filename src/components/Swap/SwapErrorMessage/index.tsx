import { useOfframp } from '../../../hooks/offramp/form/useOfframp';

export const SwapErrorMessage = () => {
  const { apiInitializeFailed, initializeFailedMessage } = useOfframp();

  if (!initializeFailedMessage && !apiInitializeFailed) {
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
