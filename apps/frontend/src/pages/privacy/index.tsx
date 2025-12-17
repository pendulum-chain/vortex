import { useTranslation } from "react-i18next";

export function PrivacyPolicyPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto max-w-4xl px-4 py-20 md:px-10">
      <h1 className="mb-4 font-bold text-3xl">{t("pages.privacyPolicy.title")}</h1>
      <p className="mb-6 text-gray-600">
        {t("pages.privacyPolicy.lastUpdated")}
        <br />
        {t("pages.privacyPolicy.version")}
      </p>

      <p className="mb-8">{t("pages.privacyPolicy.intro")}</p>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.1.title")}</h2>
        <p className="mb-4">
          <strong>{t("pages.privacyPolicy.sections.1.controller.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.1.controller.name")}
          <br />
          <strong>{t("pages.privacyPolicy.sections.1.registeredOffice.label")}</strong>
          <br />
          {t("pages.privacyPolicy.sections.1.registeredOffice.line1")}
          <br />
          {t("pages.privacyPolicy.sections.1.registeredOffice.line2")}
          <br />
          {t("pages.privacyPolicy.sections.1.registeredOffice.line3")}
          <br />
          {t("pages.privacyPolicy.sections.1.registeredOffice.line4")}
          <br />
          <strong>{t("pages.privacyPolicy.sections.1.contact.label")}</strong>{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
        </p>
        <p className="mb-4">{t("pages.privacyPolicy.sections.1.description")}</p>
        <p className="mb-4">
          <strong>{t("pages.privacyPolicy.sections.1.independentControllers.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.1.independentControllers.text")}
        </p>
        <p className="mb-4">
          <strong>{t("pages.privacyPolicy.sections.1.processors.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.1.processors.text")}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.2.title")}</h2>
        <p className="mb-2">{t("pages.privacyPolicy.sections.2.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>{t("pages.privacyPolicy.sections.2.items.1")}</li>
          <li>{t("pages.privacyPolicy.sections.2.items.2")}</li>
          <li>{t("pages.privacyPolicy.sections.2.items.3")}</li>
        </ul>
        <p>{t("pages.privacyPolicy.sections.2.note")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.3.title")}</h2>
        <p className="mb-2">{t("pages.privacyPolicy.sections.3.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>
            <strong>{t("pages.privacyPolicy.sections.3.items.contactData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.3.items.contactData.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.3.items.usageData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.3.items.usageData.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.3.items.transactionData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.3.items.transactionData.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.3.items.supportData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.3.items.supportData.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.3.items.cookiesData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.3.items.cookiesData.text")}
          </li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.4.title")}</h2>
        <p className="mb-4">{t("pages.privacyPolicy.sections.4.intro")}</p>

        <div className="mb-6 overflow-x-auto">
          <table className="w-full min-w-[600px] border-collapse border border-gray-300">
            <thead>
              <tr className="bg-gray-100">
                <th className="border border-gray-300 p-2 text-left">
                  {t("pages.privacyPolicy.sections.4.table.headers.purpose")}
                </th>
                <th className="border border-gray-300 p-2 text-left">
                  {t("pages.privacyPolicy.sections.4.table.headers.examples")}
                </th>
                <th className="border border-gray-300 p-2 text-left">
                  {t("pages.privacyPolicy.sections.4.table.headers.legalBasis")}
                </th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.1.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.1.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.1.legalBasis")}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.2.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.2.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.2.legalBasis")}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.3.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.3.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.3.legalBasis")}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.4.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.4.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.4.legalBasis")}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.5.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.5.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.5.legalBasis")}</td>
              </tr>
              <tr>
                <td className="border border-gray-300 p-2 font-semibold">
                  {t("pages.privacyPolicy.sections.4.table.rows.6.purpose")}
                </td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.6.examples")}</td>
                <td className="border border-gray-300 p-2">{t("pages.privacyPolicy.sections.4.table.rows.6.legalBasis")}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <p className="mb-4">
          <strong>{t("pages.privacyPolicy.sections.4.emailNote.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.4.emailNote.text")}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.5.title")}</h2>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>{t("pages.privacyPolicy.sections.5.items.1")}</li>
          <li>{t("pages.privacyPolicy.sections.5.items.2")}</li>
          <li>{t("pages.privacyPolicy.sections.5.items.3")}</li>
        </ul>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.6.title")}</h2>
        <p className="mb-2">{t("pages.privacyPolicy.sections.6.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>
            <strong>{t("pages.privacyPolicy.sections.6.items.partners.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.6.items.partners.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.6.items.processors.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.6.items.processors.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.6.items.legal.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.6.items.legal.text")}
          </li>
        </ul>
        <p>{t("pages.privacyPolicy.sections.6.noSale")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.7.title")}</h2>
        <p className="mb-4">{t("pages.privacyPolicy.sections.7.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>
            <strong>{t("pages.privacyPolicy.sections.7.partners.avenia.name")}</strong> –{" "}
            {t("pages.privacyPolicy.sections.7.partners.avenia.website.label")}{" "}
            <a className="text-blue-600 hover:underline" href="https://avenia.io/" rel="noopener noreferrer" target="_blank">
              https://avenia.io/
            </a>{" "}
            – {t("pages.privacyPolicy.sections.7.partners.avenia.terms.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://app.avenia.io/Avenia-TC.pdf"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://app.avenia.io/Avenia-TC.pdf
            </a>{" "}
            - {t("pages.privacyPolicy.sections.7.partners.avenia.privacy.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://app.avenia.io/Avenia-Privacy-Policy.pdf"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://app.avenia.io/Avenia-Privacy-Policy.pdf
            </a>
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.7.partners.anclap.name")}</strong> –{" "}
            {t("pages.privacyPolicy.sections.7.partners.anclap.website.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://home.anclap.com/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://home.anclap.com/
            </a>
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.7.partners.monerium.name")}</strong> –{" "}
            {t("pages.privacyPolicy.sections.7.partners.monerium.website.label")}{" "}
            <a className="text-blue-600 hover:underline" href="https://monerium.com/" rel="noopener noreferrer" target="_blank">
              https://monerium.com/
            </a>{" "}
            – {t("pages.privacyPolicy.sections.7.partners.monerium.privacyTos.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://monerium.com/policies/personal-terms-of-service-2025-05-20/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://monerium.com/policies/personal-terms-of-service-2025-05-20/
            </a>
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.7.partners.mykobo.name")}</strong> –{" "}
            {t("pages.privacyPolicy.sections.7.partners.mykobo.website.label")}{" "}
            <a className="text-blue-600 hover:underline" href="https://mykobo.io/" rel="noopener noreferrer" target="_blank">
              https://mykobo.io/
            </a>{" "}
            – {t("pages.privacyPolicy.sections.7.partners.mykobo.privacy.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://privacy.mykobo.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://privacy.mykobo.co/
            </a>{" "}
            – {t("pages.privacyPolicy.sections.7.partners.mykobo.terms.label")}{" "}
            <a
              className="text-blue-600 hover:underline"
              href="https://terms.mykobo.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              https://terms.mykobo.co/
            </a>
          </li>
        </ul>
        <p className="mt-4 mb-4">
          <strong>{t("pages.privacyPolicy.sections.7.futurePartners.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.7.futurePartners.text")}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.8.title")}</h2>
        <p className="mb-2">{t("pages.privacyPolicy.sections.8.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>
            <strong>{t("pages.privacyPolicy.sections.8.items.cloudHosting.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.8.items.cloudHosting.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.8.items.analytics.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.8.items.analytics.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.8.items.support.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.8.items.support.text")}
          </li>
        </ul>
        <p>
          <strong>{t("pages.privacyPolicy.sections.8.internationalTransfers.label")}</strong>{" "}
          {t("pages.privacyPolicy.sections.8.internationalTransfers.text")}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.9.title")}</h2>
        <p className="mb-2">{t("pages.privacyPolicy.sections.9.intro")}</p>
        <ul className="mb-4 list-disc space-y-2 pl-6">
          <li>
            <strong>{t("pages.privacyPolicy.sections.9.items.serviceData.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.9.items.serviceData.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.9.items.logs.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.9.items.logs.text")}
          </li>
          <li>
            <strong>{t("pages.privacyPolicy.sections.9.items.cookies.label")}</strong>{" "}
            {t("pages.privacyPolicy.sections.9.items.cookies.text")}
          </li>
        </ul>
        <p className="mt-4">{t("pages.privacyPolicy.sections.9.legalRetention")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.10.title")}</h2>
        <p>
          {t("pages.privacyPolicy.sections.10.text")}{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
          . {t("pages.privacyPolicy.sections.10.complaint")}
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.11.title")}</h2>
        <p className="mb-4">{t("pages.privacyPolicy.sections.11.intro")}</p>
        <p>
          {t("pages.privacyPolicy.sections.11.googleAnalytics")}{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://tools.google.com/dlpage/gaoptout"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://tools.google.com/dlpage/gaoptout
          </a>{" "}
          {t("pages.privacyPolicy.sections.11.and")}{" "}
          <a
            className="text-blue-600 hover:underline"
            href="https://policies.google.com/privacy"
            rel="noopener noreferrer"
            target="_blank"
          >
            https://policies.google.com/privacy
          </a>
          .
        </p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.12.title")}</h2>
        <p>{t("pages.privacyPolicy.sections.12.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.13.title")}</h2>
        <p>{t("pages.privacyPolicy.sections.13.text")}</p>
      </section>

      <section className="mb-8">
        <h2 className="mb-4 font-semibold text-2xl">{t("pages.privacyPolicy.sections.14.title")}</h2>
        <p className="mb-4">
          {t("pages.privacyPolicy.sections.14.text")}{" "}
          <a className="text-blue-600 hover:underline" href="mailto:privacy@vortexfinance.co">
            privacy@vortexfinance.co
          </a>
        </p>
        <p>{t("pages.privacyPolicy.sections.14.alternative")}</p>
      </section>
    </main>
  );
}
