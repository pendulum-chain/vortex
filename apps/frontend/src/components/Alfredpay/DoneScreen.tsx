import { memo } from "react";
import { useTranslation } from "react-i18next";
import documentVerified from "../../assets/document_verified.svg";
import { MenuButtons } from "../MenuButtons";
import { StepFooter } from "../StepFooter";

interface DoneScreenProps {
  kycOrKyb: string;
  onContinue?: () => void;
}

export const DoneScreen = memo(({ kycOrKyb, onContinue }: DoneScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex grow-1 flex-col items-center">
      <MenuButtons />
      <img alt="Document verified" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={documentVerified} />
      <p className="font-bold text-green-600 text-lg">{t("components.alfredpayKycFlow.completed", { kycOrKyb })}</p>
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.accountVerified")}</p>
      {onContinue && (
        <StepFooter>
          <button className="btn btn-vortex-success mt-6 w-full" onClick={onContinue} type="button">
            {t("components.alfredpayKycFlow.continue")}
          </button>
        </StepFooter>
      )}
    </div>
  );
});

DoneScreen.displayName = "DoneScreen";
