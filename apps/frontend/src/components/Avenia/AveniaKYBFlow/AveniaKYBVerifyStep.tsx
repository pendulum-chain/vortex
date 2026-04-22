import { ArrowTopRightOnSquareIcon, ShieldCheckIcon } from "@heroicons/react/24/solid";
import { Trans, useTranslation } from "react-i18next";
import { cn } from "../../../helpers/cn";
import { SparkleButton } from "../../SparkleButton";
import { StepFooter } from "../../StepFooter";

interface AveniaKYBVerifyStepProps {
  titleKey: string;
  imageSrc: string;
  imageSrcVerified?: string;
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
  imageSrcVerified,
  verificationUrl,
  isVerificationStarted,
  onCancel,
  onVerificationStart,
  onVerificationDone,
  verifyButtonKey,
  instructionsKey = "components.aveniaKYB.instructions",
  cancelButtonKey = "components.aveniaKYB.buttons.cancel"
}: AveniaKYBVerifyStepProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex min-h-(--widget-min-height) w-full grow flex-col">
      <div className="flex-1 pb-36">
        <div className="mt-8 mb-4 flex w-full flex-col">
          <div>
            <h1
              className={cn(
                "mt-2 mb-4 text-center font-bold text-2xl",
                isVerificationStarted ? "text-success" : "text-primary"
              )}
            >
              {t(titleKey)}
            </h1>

            <img
              alt="Business Check"
              className="mx-auto mt-16 w-[170px] transition-opacity duration-300 motion-reduce:transition-none"
              src={isVerificationStarted && imageSrcVerified ? imageSrcVerified : imageSrc}
            />

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

      <StepFooter>
        <div className="mt-8 grid grid-cols-2 gap-4">
          <button className="btn-vortex-primary-inverse btn" onClick={onCancel}>
            {t(cancelButtonKey)}
          </button>

          {isVerificationStarted ? (
            <SparkleButton
              icon={<ShieldCheckIcon className="h-5 w-5" />}
              label={t("components.aveniaKYB.buttons.iHaveVerified")}
              onClick={onVerificationDone}
            />
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
      </StepFooter>
    </div>
  );
};
