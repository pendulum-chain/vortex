import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "../Spinner";

interface FillingScreenProps {
  kycOrKyb: string;
  isSubmitting: boolean;
  onCompletedFilling: () => void;
}

export const FillingScreen = memo(({ kycOrKyb, isSubmitting, onCompletedFilling }: FillingScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center space-y-4 py-4">
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeInNewWindow", { kycOrKyb })}</p>
      <button className="btn-vortex-primary btn w-full rounded-xl" disabled={isSubmitting} onClick={onCompletedFilling}>
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
});

FillingScreen.displayName = "FillingScreen";
