import { memo } from "react";
import { useTranslation } from "react-i18next";

interface LinkReadyScreenProps {
  kycOrKyb: string;
  onOpenLink: () => void;
}

export const LinkReadyScreen = memo(({ kycOrKyb, onOpenLink }: LinkReadyScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center space-y-4 py-4">
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.completeProcess", { kycOrKyb })}</p>
      <button className="btn-vortex-primary btn w-full rounded-xl" onClick={onOpenLink}>
        {t("components.alfredpayKycFlow.openLink", { kycOrKyb })}
      </button>
    </div>
  );
});

LinkReadyScreen.displayName = "LinkReadyScreen";
