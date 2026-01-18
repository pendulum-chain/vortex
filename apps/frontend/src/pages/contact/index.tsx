import { useTranslation } from "react-i18next";
import { ContactForm } from "../../components/ContactForm";
import { ContactInfo } from "../../components/ContactForm/ContactInfo";

export function ContactPage() {
  const { t } = useTranslation();

  return (
    <main className="container mx-auto max-w-6xl px-4 py-20 md:px-10">
      <div className="grid grid-cols-1 gap-12 lg:grid-cols-2">
        <div className="rounded-xl border border-gray-200 bg-white p-6 shadow-xs">
          <h1 className="mb-4 border-gray-200 border-b pb-4 font-bold text-xl">{t("pages.contact.title")}</h1>
          <ContactForm />
          <p className="mt-4 pt-4 text-gray-500 text-sm">
            {t("pages.contact.emailUs")}{" "}
            <a className="text-blue-600 hover:underline" href="mailto:sales@vortexfinance.co">
              sales@vortexfinance.co
            </a>
          </p>
        </div>

        <div className="lg:pl-8">
          <ContactInfo />
        </div>
      </div>
    </main>
  );
}
