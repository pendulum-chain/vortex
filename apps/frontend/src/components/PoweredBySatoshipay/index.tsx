import { useTranslation } from "react-i18next";
import satoshipayLogo from "../../assets/logo/satoshipay.svg";

export const PoweredBySatoshipay = () => {
  const { t } = useTranslation();

  return (
    <p className="mr-1 flex items-center justify-center text-gray-500">
      <a
        className="flex items-center gap-1 text-sm transition hover:opacity-80"
        href="https://satoshipay.io"
        rel="noopener noreferrer"
        target="_blank"
      >
        {t("pages.swap.developedBy")} <img alt="Satoshipay" className="h-4" src={satoshipayLogo} />
      </a>
    </p>
  );
};
