import { useAlfredpayKycActor, useAlfredpayKycSelector } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { Spinner } from "../Spinner";

export const AlfredpayKycFlow = () => {
  const actor = useAlfredpayKycActor();
  const state = useAlfredpayKycSelector();

  const openLink = () => {
    actor?.send({ type: "OPEN_LINK" });
  };

  const completedFilling = () => {
    actor?.send({ type: "COMPLETED_FILLING" });
  };

  if (!actor || !state) return null;

  const { stateValue, context } = state;

  if (stateValue === "CheckingStatus" || stateValue === "CreatingCustomer" || stateValue === "GettingKycLink") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner />
        <p className="text-gray-600 font-medium">Loading...</p>
      </div>
    );
  }

  if (stateValue === "PollingStatus") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner />
        <p className="text-gray-600 font-medium">Verifying KYC Status...</p>
        <p className="text-gray-500 text-sm text-center">This may take a few moments. Please do not close this window.</p>
      </div>
    );
  }

  if (stateValue === "LinkReady") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">To continue, please complete the KYC process with our partner AlfredPay.</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={openLink}>
          Open KYC Link
        </button>
      </div>
    );
  }

  if (stateValue === "OpeningLink") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner />
        <p className="text-gray-600 font-medium">Opening Link...</p>
      </div>
    );
  }

  if (stateValue === "FillingKyc" || stateValue === "FinishingFilling") {
    const isSubmitting = stateValue === "FinishingFilling";

    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">
          Please complete the KYC process in the new window. Once you are done, click the button below.
        </p>
        <button className="btn-vortex-primary btn w-full rounded-xl" disabled={isSubmitting} onClick={completedFilling}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Verifying completion...
            </>
          ) : (
            "I have finished the KYC verification"
          )}
        </button>
      </div>
    );
  }

  if (stateValue === "Done") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-green-600 font-bold text-lg">KYC Completed!</p>
        <p className="text-center text-gray-600">Your account has been verified. You can now proceed.</p>
        {/* The parent component might handle navigation or updates based on this state */}
      </div>
    );
  }

  if (stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-red-600 font-bold text-lg">KYC Failed</p>
        <p className="text-center text-gray-600">{context.error?.message || "An unknown error occurred."}</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={() => actor.send({ type: "RETRY" })}>
          Retry
        </button>
      </div>
    );
  }

  return null;
};
