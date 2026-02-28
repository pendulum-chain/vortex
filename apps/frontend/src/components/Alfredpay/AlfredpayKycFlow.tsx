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

  const toggleBusiness = () => {
    actor?.send({ type: "TOGGLE_BUSINESS" });
  };

  const userAccept = () => {
    actor?.send({ type: "USER_ACCEPT" });
  };

  if (!actor || !state) return null;

  const { stateValue, context } = state;
  const kycOrKyb = context.business ? "KYB" : "KYC";

  if (
    stateValue === "CheckingStatus" ||
    stateValue === "CreatingCustomer" ||
    stateValue === "GettingKycLink" ||
    stateValue === "Retrying"
  ) {
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
        <p className="text-gray-600 font-medium">Verifying {kycOrKyb} Status...</p>
        <p className="text-gray-500 text-sm text-center">This may take a few moments. Please do not close this window.</p>
      </div>
    );
  }

  if (stateValue === "LinkReady") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">
          To continue, please complete the {kycOrKyb} process with our partner AlfredPay.
        </p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={openLink}>
          Open {kycOrKyb} Link
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
          Please complete the {kycOrKyb} process in the new window. Once you are done, click the button below.
        </p>
        <button className="btn-vortex-primary btn w-full rounded-xl" disabled={isSubmitting} onClick={completedFilling}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              Verifying completion...
            </>
          ) : (
            `I have finished the ${kycOrKyb} verification`
          )}
        </button>
      </div>
    );
  }

  if (stateValue === "Done") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-green-600 font-bold text-lg">{kycOrKyb} Completed!</p>
        <p className="text-center text-gray-600">Your account has been verified. You can now proceed.</p>
        {/* Will not be rendered as the sub-state machine will stop and go to main kyc one */}
      </div>
    );
  }

  if (stateValue === "FailureKyc") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-red-600 font-bold text-lg">{kycOrKyb} Failed</p>
        <p className="text-center text-gray-600">{context.error?.message || "An unknown error occurred."}</p>
        <div className="flex w-full flex-col gap-2">
          <button className="btn-vortex-primary btn w-full rounded-xl" onClick={() => actor.send({ type: "USER_RETRY" })}>
            Retry
          </button>
          <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={() => actor.send({ type: "USER_CANCEL" })}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-red-600 font-bold text-lg">System Error</p>
        <p className="text-center text-gray-600">{context.error?.message || "An unknown error occurred."}</p>
        <div className="flex w-full flex-col gap-2">
          <button className="btn-vortex-primary btn w-full rounded-xl" onClick={() => actor.send({ type: "RETRY_PROCESS" })}>
            Retry Process
          </button>
          <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={() => actor.send({ type: "CANCEL_PROCESS" })}>
            Cancel
          </button>
        </div>
      </div>
    );
  }

  if (stateValue === "CostumerDefinition") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">Please continue with our partner for the {kycOrKyb} verification.</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={userAccept}>
          Continue
        </button>
        <p className="text-center text-gray-500 text-sm">
          {context.business ? (
            <>
              Click{" "}
              <span className="cursor-pointer text-blue-600 underline hover:text-blue-800" onClick={toggleBusiness}>
                here
              </span>{" "}
              to register as individual
            </>
          ) : (
            <>
              If registering as a business please click{" "}
              <span className="cursor-pointer text-blue-600 underline hover:text-blue-800" onClick={toggleBusiness}>
                here
              </span>
            </>
          )}
        </p>
      </div>
    );
  }

  return null;
};
