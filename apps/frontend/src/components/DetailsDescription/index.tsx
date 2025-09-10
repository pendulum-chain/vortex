import { FC } from "react";
import { useTranslation } from "react-i18next";
import { useVortexAccount } from "../../hooks/useVortexAccount";

export const DetailsDescription: FC = () => {
  const { t } = useTranslation();

  return (
    <div className="mb-4 text-center">
      {true ? (
        <p className="text-gray-600 text-sm">{t("components.detailsHelper.signToConfirm")}</p>
      ) : (
        <p className="text-gray-600 text-sm">{t("components.detailsHelper.connectWallet")}</p>
      )}
    </div>
  );
};
