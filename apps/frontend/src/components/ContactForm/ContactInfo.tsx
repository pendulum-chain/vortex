import { ChevronRightIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";

export function ContactInfo() {
  const { t } = useTranslation();

  return (
    <div className="rounded-xl bg-gray-50 p-6 md:p-8">
      <h2 className="mb-6 font-bold text-xl text-gray-900" style={{ textWrap: "balance" }}>
        {t("pages.contact.info.title")}
      </h2>

      <ul className="mb-8 space-y-3 text-gray-700">
        <li className="flex items-center gap-3">
          <CheckIcon />
          <span>{t("pages.contact.info.requestDemo")}</span>
        </li>
        <li className="flex items-center gap-3">
          <CheckIcon />
          <span>{t("pages.contact.info.onboardingHelp")}</span>
        </li>
        <li className="flex items-center gap-3">
          <CheckIcon />
          <span>{t("pages.contact.info.integrationHelp")}</span>
        </li>
      </ul>

      <div className="border-gray-200 border-t pt-6">
        <p className="mb-3 text-gray-600 text-sm">{t("pages.contact.info.technicalQuestions")}</p>
        <a
          className="group inline-flex min-h-[44px] items-center gap-2 text-blue-600 transition-colors duration-150 ease-out hover:text-blue-700"
          href="https://t.me/vortex_fi"
          rel="noopener noreferrer"
          target="_blank"
        >
          <span className="font-medium">{t("pages.contact.info.supportLink")}</span>
          <ChevronRightIcon
            aria-hidden="true"
            className="h-4 w-4 transition-transform duration-150 ease-out group-hover:translate-x-0.5"
          />
        </a>
      </div>
    </div>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-hidden="true"
      className="h-5 w-5 flex-shrink-0 text-blue-600"
      fill="none"
      stroke="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M5 13l4 4L19 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} />
    </svg>
  );
}
