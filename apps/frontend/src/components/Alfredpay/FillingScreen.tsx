import { CheckCircleIcon } from "@heroicons/react/24/solid";
import { memo } from "react";
import { useTranslation } from "react-i18next";
import documentReadySuccess from "../../assets/document_ready_success.svg";
import { MenuButtons } from "../MenuButtons";
import { SparkleButton } from "../SparkleButton";
import { Spinner } from "../Spinner";
import { StepFooter } from "../StepFooter";

interface FillingScreenProps {
  kycOrKyb: string;
  isSubmitting: boolean;
  onCompletedFilling: () => void;
  onOpenLink?: () => void;
}

export const FillingScreen = memo(({ kycOrKyb, isSubmitting, onCompletedFilling, onOpenLink }: FillingScreenProps) => {
  const { t } = useTranslation();

  return (
    <main className="relative flex grow-1 flex-col items-center">
      <MenuButtons />
      <img alt="Document ready" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={documentReadySuccess} />
      <p className="text-center text-success">{t("components.alfredpayKycFlow.completeInNewWindow", { kycOrKyb })}</p>
      {onOpenLink && (
        <button className="mt-2 text-primary text-sm underline" onClick={onOpenLink} type="button">
          {t("components.alfredpayKycFlow.reopenLink", { kycOrKyb })}
        </button>
      )}
      <StepFooter>
        {isSubmitting ? (
          <button className="btn-vortex-success btn w-full rounded-xl" disabled type="button">
            <Spinner />
            {t("components.alfredpayKycFlow.verifyingCompletion")}
          </button>
        ) : (
          <SparkleButton
            icon={<CheckCircleIcon className="h-5 w-5" />}
            label={t("components.alfredpayKycFlow.finishedVerification", { kycOrKyb })}
            onClick={onCompletedFilling}
          />
        )}
      </StepFooter>
    </main>
  );
});

FillingScreen.displayName = "FillingScreen";
