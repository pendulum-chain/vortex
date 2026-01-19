import { ArrowTopRightOnSquareIcon } from "@heroicons/react/24/solid";
import { Trans, useTranslation } from "react-i18next";
import { useQuote } from "../../../stores/quote/useQuoteStore";
import { QUOTE_SUMMARY_COLLAPSED_HEIGHT, QuoteSummary } from "../../QuoteSummary";

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
    <div
      className="relative flex min-h-[506px] w-full grow flex-col"
      style={{ "--quote-summary-height": `${QUOTE_SUMMARY_COLLAPSED_HEIGHT}px` } as React.CSSProperties}
    >
      <div className="flex-1 pb-36">
        <div className="mt-8 mb-4 flex w-full flex-col">
          <div>
            <h1 className="mt-2 mb-4 text-center font-bold text-2xl text-blue-700">{t(titleKey)}</h1>

            <img alt="Business Check" className="mx-auto mt-16 w-[170px] transition-all duration-300" src={imageSrc} />

            {!isVerificationStarted && (
              <p className="mx-1 mt-6 mb-4 text-center">
                <Trans i18nKey={instructionsKey}>
                  Please provide our trusted partner
                  <a className="underline" href="https://www.avenia.io" rel="noreferrer" target="_blank">
                    Avenia
                  </a>
                  with your company registration information and the required documents.
                </Trans>
              </p>
            )}

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
        </div>
      </div>

      <div className="absolute right-0 left-0 z-[5] mb-4" style={{ bottom: `calc(var(--quote-summary-height, 100px) + 2rem)` }}>
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
      {quote && <QuoteSummary quote={quote} />}
    </div>
  );
};
