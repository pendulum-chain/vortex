import { Trans, useTranslation } from "react-i18next";
import { CallToActionSection } from "../../../components/CallToActionSection";

export const GotQuestions = () => {
  const { t } = useTranslation();

  return (
    <CallToActionSection
      buttonText={t("sections.gotQuestions.contactSales")}
      description={t("sections.gotQuestions.description")}
      title={
        <Trans i18nKey="sections.gotQuestions.getStartedTitle">
          Get Started <br /> <span className="font-bold text-blue-400">with Vortex</span>
        </Trans>
      }
    />
  );
};
