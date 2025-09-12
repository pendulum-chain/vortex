import { useTranslation } from "react-i18next";
import { DetailsDescription } from "../../DetailsDescription";
import { MenuButtons } from "../../MenuButtons";

export interface DetailsStepHeaderProps {
  className?: string;
}

export const DetailsStepHeader = ({ className }: DetailsStepHeaderProps) => {
  const { t } = useTranslation();

  return (
    <div className={className}>
      <MenuButtons />
      <div className="mt-4 text-center">
        <h1 className="mb-4 font-bold text-3xl text-blue-700">{t("pages.widget.details.title")}</h1>
        <DetailsDescription />
      </div>
    </div>
  );
};
