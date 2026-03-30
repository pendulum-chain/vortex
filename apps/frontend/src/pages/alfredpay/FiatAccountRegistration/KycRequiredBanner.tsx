import { useTranslation } from "react-i18next";
import { AlertBanner } from "../../../components/AlertBanner";

const kycIcon = (
  <svg
    className="h-5 w-5 shrink-0 text-yellow-600"
    fill="none"
    stroke="currentColor"
    viewBox="0 0 24 24"
    xmlns="http://www.w3.org/2000/svg"
  >
    <path
      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
    />
  </svg>
);

export function KycRequiredBanner() {
  const { t } = useTranslation();
  return (
    <AlertBanner
      className="mb-6"
      description={t("components.fiatAccountRegistration.kycRequired.description")}
      icon={kycIcon}
      title={t("components.fiatAccountRegistration.kycRequired.title")}
    />
  );
}
