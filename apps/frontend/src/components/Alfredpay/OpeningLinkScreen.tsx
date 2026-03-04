import { memo } from "react";
import { useTranslation } from "react-i18next";
import { Spinner } from "../Spinner";

export const OpeningLinkScreen = memo(() => {
  const { t } = useTranslation();

  return (
    <div className="flex flex-col items-center justify-center space-y-4 py-8">
      <Spinner />
      <p className="font-medium text-gray-600">{t("components.alfredpayKycFlow.openingLink")}</p>
    </div>
  );
});

OpeningLinkScreen.displayName = "OpeningLinkScreen";
