import { useTranslation } from "react-i18next";

export function TermsAndConditionsPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto max-w-4xl px-4 py-20 md:px-10">
      <h1 className="mb-4 font-bold text-3xl">{t("pages.termsAndConditions.title")}</h1>
      <p className="mb-6 text-gray-600">{t("pages.termsAndConditions.lastUpdated")}</p>

      <p className="mb-8">{t("pages.termsAndConditions.intro")}</p>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.1.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.1.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.2.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.2.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.3.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.3.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.4.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.4.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.5.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.5.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.6.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.6.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.7.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.7.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.8.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.8.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.9.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.9.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.10.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.10.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.11.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.11.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.termsAndConditions.sections.12.title")}</h2>
        <p>{t("pages.termsAndConditions.sections.12.text")}</p>
      </section>
    </main>
  );
}
