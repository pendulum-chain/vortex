import { useTranslation } from "react-i18next";
import satoshipayLogo from "../../assets/logo/satoshipay.svg";

export const PoweredBySatoshipay = () => {
  const { t } = useTranslation();

  return (
    <p className="mr-1 flex items-center justify-center text-gray-500">
      <a
        href="https://satoshipay.io"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1 text-sm transition hover:opacity-80"
      >
        {t("pages.swap.developedBy")} <img src={satoshipayLogo} alt="Satoshipay" className="h-4" />
      </a>
    </p>
  );
};
