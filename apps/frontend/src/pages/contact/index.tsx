import { motion, useReducedMotion } from "motion/react";
import { useTranslation } from "react-i18next";
import { ContactForm } from "../../components/ContactForm";
import { ContactInfo } from "../../components/ContactForm/ContactInfo";

export function ContactPage() {
  const { t } = useTranslation();
  const shouldReduceMotion = useReducedMotion();

  return (
    <main className="container mx-auto max-w-6xl px-4 py-16 md:px-10 md:py-20">
      <div className="grid grid-cols-1 items-start gap-10 lg:grid-cols-2 lg:gap-12">
        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="rounded-xl bg-white p-6 shadow-[0_0_0_1px_rgba(0,0,0,0.08),0_4px_12px_rgba(0,0,0,0.05)] md:p-8"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <h1 className="mb-6 font-bold text-gray-900 text-xl" style={{ textWrap: "balance" }}>
            {t("pages.contact.title")}
          </h1>

          <ContactForm />

          <p className="mt-6 border-gray-100 border-t pt-6 text-gray-500 text-sm">
            {t("pages.contact.emailUs")}{" "}
            <a
              className="text-blue-600 underline decoration-blue-600/30 underline-offset-2 transition-colors duration-150 ease-out hover:text-blue-700 hover:decoration-blue-700/50"
              href="mailto:sales@vortexfinance.co"
            >
              sales@vortexfinance.co
            </a>
          </p>
        </motion.div>

        <motion.div
          animate={{ opacity: 1, y: 0 }}
          className="lg:sticky lg:top-8"
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          transition={{ delay: shouldReduceMotion ? 0 : 0.1, duration: 0.25, ease: [0.25, 0.46, 0.45, 0.94] }}
        >
          <ContactInfo />
        </motion.div>
      </div>
    </main>
  );
}
