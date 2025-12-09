import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import WidgetSnippetImageEUR from "../../assets/vortex-metamask.png";

export function BusinessMain() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-gradient-to-b from-white to-blue-50 py-16 lg:py-32">
      <div className="container mx-auto flex flex-col gap-x-20 gap-y-10 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-6">
          <h1 className="pt-8 text-center font-bold text-gray-800 text-h1 lg:pt-0 lg:text-start">
            <Trans i18nKey="pages.business.hero.titlePart1" />{" "}
            <span className="text-blue-700">
              <Trans i18nKey="pages.business.hero.titlePart2" />
            </span>
          </h1>
          <p className="text-center text-body-lg lg:text-left">{t("pages.business.hero.description")}</p>

          <div className="mt-2 flex justify-center gap-x-4 lg:justify-start">
            <a
              className="btn btn-vortex-primary w-1/3"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              Contact us <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
            <button className="btn btn-vortex-primary-inverse w-1/3">
              Read our docs <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>

        <div className="mx-auto flex flex-col items-center justify-center pt-2 md:w-4/5 lg:mx-0 xl:w-full">
          <img
            alt="Widget Snippet EUR"
            className="z-10 rounded-lg shadow-custom hover:z-30 lg:absolute lg:top-1/5 lg:right-[-230px] lg:w-full lg:max-w-[780px] xl:max-w-[880px] 2xl:static"
            draggable={false}
            src={WidgetSnippetImageEUR}
          />
        </div>
      </div>
    </section>
  );
}
