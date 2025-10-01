import { useTranslation } from "react-i18next";
import { useAveniaKycActor, useAveniaKycSelector } from "../../../contexts/rampState";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { DetailsStepQuoteSummary } from "../../widget-steps/DetailsStep/DetailsStepQuoteSummary";

export const AveniaKYBVerifyCompanyRepresentative = () => {
  const aveniaKycActor = useAveniaKycActor();
  const aveniaState = useAveniaKycSelector();
  const quote = useQuote();
  const { t } = useTranslation();

  if (!aveniaState || !aveniaKycActor) return null;

  const { kybUrls } = aveniaState.context;

  if (!kybUrls) {
    return null;
  }

  return (
    <>
      <div className="relative">
        <div className="mt-8 mb-4 min-h-[480px] w-full">
          <h1 className="mt-2 mb-4 text-center font-bold text-3xl text-blue-700">{t("components.aveniaKYB.title")}</h1>

          <div className="mt-4 text-center">
            <p className="mb-4">{t("components.aveniaKYB.aveniaKYBVerifyCompanyRepresentative.instructions")}</p>
            <div className="mt-6 mb-4">
              <h2 className="mb-2 font-bold text-lg">{t("components.aveniaKYB.representativeData")}</h2>
              <a
                className="btn-vortex-primary btn w-full"
                href={kybUrls.authorizedRepresentativeUrl}
                onClick={() => aveniaKycActor.send({ type: "REPRESENTATIVE_VERIFICATION_STARTED" })}
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("components.aveniaKYB.verifyCompanyRepresentative")}
              </a>
            </div>
          </div>

          <div className="mt-8 flex gap-4">
            <button
              className="btn-vortex-primary-inverse btn flex-1"
              onClick={() => aveniaKycActor.send({ type: "KYB_COMPANY_BACK" })}
            >
              {t("components.aveniaKYB.buttons.cancel")}
            </button>
            <button
              className="btn-vortex-primary btn flex-1"
              disabled={!aveniaState.context.representativeVerificationStarted}
              onClick={() => aveniaKycActor.send({ type: "KYB_REPRESENTATIVE_DONE" })}
            >
              {t("components.aveniaKYB.buttons.done")}
            </button>
          </div>
        </div>
      </div>
      <DetailsStepQuoteSummary quote={quote} />
    </>
  );
};
