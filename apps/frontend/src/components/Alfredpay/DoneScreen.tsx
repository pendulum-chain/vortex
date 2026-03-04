import { memo } from "react";
import { useTranslation } from "react-i18next";

interface DoneScreenProps {
  kycOrKyb: string;
}

export const DoneScreen = memo(({ kycOrKyb }: DoneScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center space-y-4 py-4">
      <p className="font-bold text-green-600 text-lg">{t("components.alfredpayKycFlow.completed", { kycOrKyb })}</p>
      <p className="text-center text-gray-600">{t("components.alfredpayKycFlow.accountVerified")}</p>
      {/* Will not be rendered as the sub-state machine will stop and go to main kyc one */}
    </div>
  );
});

DoneScreen.displayName = "DoneScreen";
