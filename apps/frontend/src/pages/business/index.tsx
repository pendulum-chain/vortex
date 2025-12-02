import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";

import WidgetSnippetImageBRL from "../../assets/widget-full-snippet-brl.png";
import WidgetSnippetImageEUR from "../../assets/widget-full-snippet-eur.png";
import WidgetSnippetImageSell from "../../assets/widget-full-snippet-sell.png";

export function BusinessMain() {
  const { t } = useTranslation();

  return (
    <section className="container mx-auto grid grid-cols-1 grid-rows-2 gap-x-20 gap-y-10 px-4 md:px-10 ">
      <div className="flex animate-slide-up flex-col items-center justify-center">
        <h1 className="max-w-128 text-center font-bold text-gray-800 text-h2">
          <Trans i18nKey="pages.business.hero.titlePart1" />{" "}
          <span className="text-blue-700">
            <Trans i18nKey="pages.business.hero.titlePart2" />
          </span>
        </h1>
        <p className="my-6 max-w-164 text-center sm:text-lg">{t("pages.business.hero.description")}</p>

        <div className="mt-4 flex animate-slide-up justify-center gap-2 lg:justify-start">
          <a
            className="btn btn-vortex-primary"
            href="https://api-docs.vortexfinance.co/"
            rel="noopener noreferrer"
            target="_blank"
          >
            {t("pages.business.hero.sdkIntegration")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
          <div className="relative">
            <div className="badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">
              {t("pages.business.hero.comingSoon")}
            </div>
            <button className="btn btn-vortex-primary-inverse" disabled>
              {t("pages.business.hero.widgetIntegration")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto flex w-flex items-center justify-around lg:w-2/3">
        <motion.img
          alt="Widget Snippet EUR"
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="z-10 w-1/3 cursor-pointer rounded-lg shadow-custom hover:z-30"
          draggable={false}
          initial={{ opacity: 0, scale: 0.9, y: 150 }}
          src={WidgetSnippetImageEUR}
          transition={{ delay: 0.45, duration: 0.25, ease: "easeOut" }}
          whileHover={{ scale: 1.15, transition: { duration: 0.1, ease: "easeOut" } }}
        />

        <motion.img
          alt="Widget Snippet Sell"
          animate={{ opacity: 1, scale: 1.15, y: 0 }}
          className="z-20 w-1/3 cursor-pointer rounded-lg shadow-custom hover:z-30"
          draggable={false}
          initial={{ opacity: 0, scale: 0.9, y: 150 }}
          src={WidgetSnippetImageSell}
          transition={{ delay: 0.25, duration: 0.25, ease: "easeOut" }}
          whileHover={{ scale: 1.25, transition: { duration: 0.1, ease: "easeOut" } }}
        />

        <motion.img
          alt="Widget Snippet BRL"
          animate={{ opacity: 1, scale: 1, y: 0 }}
          className="z-10 w-1/3 cursor-pointer rounded-lg shadow-custom hover:z-30"
          draggable={false}
          initial={{ opacity: 0, scale: 0.9, y: 150 }}
          src={WidgetSnippetImageBRL}
          transition={{ delay: 0.45, duration: 0.25, ease: "easeOut" }}
          whileHover={{ scale: 1.15, transition: { duration: 0.1, ease: "easeOut" } }}
        />
      </div>
      <div className="relative z-20 mt-24 flex w-full items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5"></div>
    </section>
  );
}
