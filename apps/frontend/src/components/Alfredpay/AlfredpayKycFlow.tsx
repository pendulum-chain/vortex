import { Trans, useTranslation } from "react-i18next";
import { useAlfredpayKycActor, useAlfredpayKycSelector } from "../../contexts/rampState";
import { cn } from "../../helpers/cn";
import { Spinner } from "../Spinner";

export const AlfredpayKycFlow = () => {
  const { t } = useTranslation();
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
        <p className="text-gray-600 font-medium">{t("components.alfredpayKycFlow.loading")}</p>
      </div>
    );
  }

  if (stateValue === "PollingStatus") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner />
        <p className="text-gray-600 font-medium">{t("components.alfredpayKycFlow.verifyingStatus", { kycOrKyb })}</p>
        <p className="text-gray-500 text-sm text-center">{t("components.alfredpayKycFlow.verifyingStatusDescription")}</p>
      </div>
    );
  }

  if (stateValue === "LinkReady") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeProcess", { kycOrKyb })}</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={openLink}>
          {t("components.alfredpayKycFlow.openLink", { kycOrKyb })}
        </button>
      </div>
    );
  }

  if (stateValue === "OpeningLink") {
    return (
      <div className="flex flex-col items-center justify-center space-y-4 py-8">
        <Spinner />
        <p className="text-gray-600 font-medium">{t("components.alfredpayKycFlow.openingLink")}</p>
      </div>
    );
  }

  if (stateValue === "FillingKyc" || stateValue === "FinishingFilling") {
    const isSubmitting = stateValue === "FinishingFilling";

    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeInNewWindow", { kycOrKyb })}</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" disabled={isSubmitting} onClick={completedFilling}>
          {isSubmitting ? (
            <>
              <Spinner className="mr-2 h-4 w-4" />
              {t("components.alfredpayKycFlow.verifyingCompletion")}
            </>
          ) : (
            t("components.alfredpayKycFlow.finishedVerification", { kycOrKyb })
          )}
        </button>
      </div>
    );
  }

  if (stateValue === "Done") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-green-600 font-bold text-lg">{t("components.alfredpayKycFlow.completed", { kycOrKyb })}</p>
        <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.accountVerified")}</p>
        {/* Will not be rendered as the sub-state machine will stop and go to main kyc one */}
      </div>
    );
  }

  if (stateValue === "FailureKyc") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-red-600 font-bold text-lg">{t("components.alfredpayKycFlow.failed", { kycOrKyb })}</p>
        <p className="text-center text-gray-600">{context.error?.message || "An unknown error occurred."}</p>
        <div className="flex w-full flex-col gap-2">
          <button className="btn-vortex-primary btn w-full rounded-xl" onClick={() => actor.send({ type: "USER_RETRY" })}>
            {t("components.alfredpayKycFlow.retry")}
          </button>
          <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={() => actor.send({ type: "USER_CANCEL" })}>
            {t("components.alfredpayKycFlow.cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (stateValue === "Failure") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-red-600 font-bold text-lg">{t("components.alfredpayKycFlow.systemError")}</p>
        <p className="text-center text-gray-600">{context.error?.message || "An unknown error occurred."}</p>
        <div className="flex w-full flex-col gap-2">
          <button className="btn-vortex-primary btn w-full rounded-xl" onClick={() => actor.send({ type: "RETRY_PROCESS" })}>
            {t("components.alfredpayKycFlow.retryProcess")}
          </button>
          <button className="btn-vortex-secondary btn w-full rounded-xl" onClick={() => actor.send({ type: "CANCEL_PROCESS" })}>
            {t("components.alfredpayKycFlow.cancel")}
          </button>
        </div>
      </div>
    );
  }

  if (stateValue === "CostumerDefinition") {
    return (
      <div className="flex flex-col items-center space-y-4 py-4">
        <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.continueWithPartner", { kycOrKyb })}</p>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={userAccept}>
          {t("components.alfredpayKycFlow.continue")}
        </button>
        <p className="text-center text-gray-500 text-sm">
          {context.business ? (
            <Trans
              components={{
                1: <span className="cursor-pointer text-blue-600 underline hover:text-blue-800" onClick={toggleBusiness} />
              }}
              i18nKey="components.alfredpayKycFlow.registerAsIndividual"
            />
          ) : (
            <Trans
              components={{
                1: <span className="cursor-pointer text-blue-600 underline hover:text-blue-800" onClick={toggleBusiness} />
              }}
              i18nKey="components.alfredpayKycFlow.registerAsBusiness"
            />
          )}
        </p>
      </div>
    );
  }

  return null;
};
