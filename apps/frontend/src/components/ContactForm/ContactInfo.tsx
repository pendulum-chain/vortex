import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import Telegram from "../../assets/socials/telegram.svg";

export function ContactInfo() {
  const { t } = useTranslation();

  return (
    <div className="rounded-lg bg-base-100 p-8">
      <h2 className="mb-6 font-bold text-2xl text-gray-900">{t("pages.contact.info.title")}</h2>

      <ul className="mb-8 space-y-3 text-gray-700">
        <li className="flex items-center gap-3">
          <CheckIcon />
          {t("pages.contact.info.requestDemo")}
        </li>
        <li className="flex items-center gap-3">
          <CheckIcon />
          {t("pages.contact.info.onboardingHelp")}
        </li>
        <li className="flex items-center gap-3">
          <CheckIcon />
          {t("pages.contact.info.integrationHelp")}
        </li>
      </ul>

      <div className="border-gray-200 border-t pt-6">
        <p className="mb-3 text-gray-700">{t("pages.contact.info.technicalQuestions")}</p>
        <a
          className="group flex items-center gap-2 text-blue-600 transition-colors hover:text-blue-800"
          href="https://t.me/vortex_fi"
          rel="noopener noreferrer"
          target="_blank"
        >
          {t("pages.contact.info.supportLink")}
          <ChevronRightIcon className="h-4 w-4 transition-transform group-hover:translate-x-1" />
        </a>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg className="h-5 w-5 flex-shrink-0 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}
