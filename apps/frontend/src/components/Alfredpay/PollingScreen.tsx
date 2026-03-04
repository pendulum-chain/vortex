import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "../Spinner";

interface PollingScreenProps {
  kycOrKyb: string;
}

export const PollingScreen = memo(({ kycOrKyb }: PollingScreenProps) => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8">
      <Spinner />
      <p className="font-medium text-gray-600">{t("components.alfredpayKycFlow.verifyingStatus", { kycOrKyb })}</p>
      <p className="text-center text-gray-500 text-sm">{t("components.alfredpayKycFlow.verifyingStatusDescription")}</p>
    </div>
  );
});

PollingScreen.displayName = "PollingScreen";
