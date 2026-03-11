import { memo } from "react";
import { useTranslation } from "react-i18next";
import documentReady from "../../assets/document_ready.svg";
import { MenuButtons } from "../MenuButtons";
import { Spinner } from "../Spinner";
import { StepFooter } from "../StepFooter";

interface FillingScreenProps {
  kycOrKyb: string;
  isSubmitting: boolean;
  onCompletedFilling: () => void;
}

export const FillingScreen = memo(({ kycOrKyb, isSubmitting, onCompletedFilling }: FillingScreenProps) => {
  const { t } = useTranslation();

  return (
    <main className="relative flex grow-1 flex-col items-center">
      <MenuButtons />
      <img alt="Business Handshake" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={documentReady} />
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeInNewWindow", { kycOrKyb })}</p>
      <StepFooter>
        <button className="btn-vortex-primary btn w-full rounded-xl" disabled={isSubmitting} onClick={onCompletedFilling}>
          {isSubmitting ? (
            <>
              <Spinner />
              {t("components.alfredpayKycFlow.verifyingCompletion")}
            </>
          ) : (
            t("components.alfredpayKycFlow.finishedVerification", { kycOrKyb })
          )}
        </button>
      </StepFooter>
    </main>
  );
});

FillingScreen.displayName = "FillingScreen";
