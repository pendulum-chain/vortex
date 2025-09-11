import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useVortexAccount } from "../../hooks/useVortexAccount";

export const DetailsDescription: FC = () => {
  const { t } = useTranslation();
  const { isConnected } = useVortexAccount();

  return (
    <div className="mb-4 text-center">
      {isConnected ? (
        <p className="text-gray-600 text-sm">{t("components.detailsDescription.signToConfirm")}</p>
      ) : (
        <p className="text-gray-600 text-sm">{t("components.detailsDescription.connectWallet")}</p>
      )}
    </div>
  );
};
