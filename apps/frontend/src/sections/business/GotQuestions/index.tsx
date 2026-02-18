import { Trans, useTranslation } from "react-i18next";
import { CallToActionSection } from "../../../components/CallToActionSection";

export const GotQuestions = () => {
  const { t, i18n } = useTranslation();

  return (
    <CallToActionSection
      buttonText={t("sections.gotQuestions.contactSales")}
      buttonUrl={`/${i18n.language}/contact`}
      description={t("sections.gotQuestions.description")}
      isExternal={false}
      title={
        <Trans i18nKey="sections.gotQuestions.getStartedTitle">
          <span className="font-bold text-blue-400" />
        </Trans>
      }
    />
  );
};
