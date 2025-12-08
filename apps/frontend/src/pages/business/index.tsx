import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";
import WidgetSnippetImageEUR from "../../assets/vortex-metamask.png";
import WidgetSnippetImageBRL from "../../assets/widget-full-snippet-brl.png";
import WidgetSnippetImageSell from "../../assets/widget-full-snippet-sell.png";

export function BusinessMain() {
  const { t } = useTranslation();

  return (
    <section className="container mx-auto flex flex-col gap-x-20 gap-y-10 px-4 pt-16 md:px-10 lg:pt-20">
      <div className="flex animate-slide-up flex-col items-center justify-center">
        <h1 className="max-w-128 text-center font-bold text-gray-800 text-h1">
          <Trans i18nKey="pages.business.hero.titlePart1" />{" "}
          <span className="text-blue-700">
            <Trans i18nKey="pages.business.hero.titlePart2" />
          </span>
        </h1>
        <p className="my-6 max-w-164 text-center sm:text-lg">{t("pages.business.hero.description")}</p>

        <div className="mt-4 flex animate-slide-up justify-center gap-2 lg:justify-start ">
          <a
            className="btn btn-vortex-primary"
            href="https://api-docs.vortexfinance.co/"
            rel="noopener noreferrer"
            target="_blank"
          >
            Contact us <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
          <div className="relative">
            <button className="btn btn-vortex-primary-inverse">
              Read our docs <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      <div className="relative mx-auto mt-16 flex w-flex items-center justify-around lg:w-2/3">
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
      </div>
      <div className="mt-24 flex flex-col items-center justify-center">
        <div className="relative z-20 flex w-full items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5"></div>
        <div className="relative z-20 mt-1.5 flex w-5/6 items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5 opacity-60 transition-opacity duration-300 hover:opacity-100"></div>
        <div className="relative z-20 mt-1.5 flex w-4/6 items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5 opacity-40 transition-opacity duration-300 hover:opacity-100"></div>
        <div className="relative z-20 mt-1.5 flex w-3/6 items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5 opacity-20 transition-opacity duration-300 hover:opacity-100"></div>
        <div className="relative z-20 mt-1.5 flex w-2/6 items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5 opacity-5 transition-opacity duration-300 hover:opacity-100"></div>
        <div className="relative z-20 mt-1.5 flex w-1/6 items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5 opacity-2 transition-opacity duration-300 hover:opacity-100"></div>
      </div>
    </section>
  );
}
