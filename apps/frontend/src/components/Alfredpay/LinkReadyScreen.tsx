import { memo } from "react";
import { useTranslation } from "react-i18next";
import livenessCheck from "../../assets/liveness-check.svg";
import { MenuButtons } from "../MenuButtons";
import { StepFooter } from "../StepFooter";

interface LinkReadyScreenProps {
  kycOrKyb: string;
  onOpenLink: () => void;
}

export const LinkReadyScreen = memo(({ kycOrKyb, onOpenLink }: LinkReadyScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="relative flex grow-1 flex-col items-center">
      <MenuButtons />
      <img alt="Liveness Check" className="mx-auto mt-8 mb-8 h-50 w-1/2 object-contain" src={livenessCheck} />
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeProcess", { kycOrKyb })}</p>
      <StepFooter>
        <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onOpenLink}>
          {t("components.alfredpayKycFlow.openLink", { kycOrKyb })}
        </button>
      </StepFooter>
    </div>
  );
});

LinkReadyScreen.displayName = "LinkReadyScreen";
