import { Trans, useTranslation } from "react-i18next";
import { CallToActionSection } from "../../../components/CallToActionSection";

export const GotQuestions = () => {
  const { t, i18n } = useTranslation();

  return (
    <CallToActionSection
      buttonText={t("sections.gotQuestions.contactUs")}
      buttonUrl={`/${i18n.language}/contact`}
      description={t("sections.gotQuestions.description")}
      title={
        <Trans i18nKey="sections.gotQuestions.title">
          Got Questions? <br /> We're here to help!
        </Trans>
      }
    />
  );
};
