import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { Trans, useTranslation } from "react-i18next";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { DetailsStepQuoteSummary } from "../../widget-steps/DetailsStep/DetailsStepQuoteSummary";

interface AveniaKYBVerifyStepProps {
  titleKey: string;
  imageSrc: string;
  verificationUrl: string;
  isVerificationStarted: boolean;
  onCancel: () => void;
  onVerificationStart: () => void;
  onVerificationDone: () => void;
  verifyButtonKey: string;
  instructionsKey?: string;
  cancelButtonKey?: string;
}

export const AveniaKYBVerifyStep = ({
  titleKey,
  imageSrc,
  verificationUrl,
  isVerificationStarted,
  onCancel,
  onVerificationStart,
  onVerificationDone,
  verifyButtonKey,
  instructionsKey = "components.aveniaKYB.instructions",
  cancelButtonKey = "components.aveniaKYB.buttons.cancel"
}: AveniaKYBVerifyStepProps) => {
  const quote = useQuote();
  const { t } = useTranslation();

  return (
    <>
      <div className="mt-8 mb-4 flex min-h-[506px] w-full flex-col justify-between">
        <div>
          <h1 className="mt-2 mb-4 text-center font-bold text-2xl text-blue-700">{t(titleKey)}</h1>

          <img alt="Business Check" className="mx-auto mt-16 w-[170px] transition-all duration-300" src={imageSrc} />

          {!isVerificationStarted && <p className="mx-1 mt-6 mb-4 text-center">{t(instructionsKey)}</p>}

          {isVerificationStarted && (
            <div className="mx-1 mt-6 text-center">
              <Trans
                components={{
                  1: (
                    <a
                      className="cursor-pointer font-bold text-primary underline"
                      href={verificationUrl}
                      rel="noopener noreferrer"
                      target="_blank"
                    >
                      here
                    </a>
                  )
                }}
                i18nKey="components.aveniaKYB.tryAgain"
              />
            </div>
          )}
        </div>

        <div className="mt-8 flex gap-4">
          <button className="btn-vortex-primary-inverse btn flex-1" onClick={onCancel}>
            {t(cancelButtonKey)}
          </button>

          {isVerificationStarted ? (
            <button className="btn-vortex-primary btn flex-1" onClick={onVerificationDone}>
              {t("components.aveniaKYB.buttons.iHaveVerified")}
            </button>
          ) : (
            <a
              className="btn-vortex-primary btn flex flex-1 items-center justify-center gap-1"
              href={verificationUrl}
              onClick={onVerificationStart}
              rel="noopener noreferrer"
              target="_blank"
            >
              {t(verifyButtonKey)}
              <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          )}
        </div>
      </div>
      <DetailsStepQuoteSummary quote={quote} />
    </>
  );
};
