import { motion } from "framer-motion";
import { Trans, useTranslation } from "react-i18next";

import WidgetSnippetImageBRL from "../../assets/widget-full-snippet-brl.png";
import WidgetSnippetImageEUR from "../../assets/widget-full-snippet-eur.png";
import WidgetSnippetImageSell from "../../assets/widget-full-snippet-sell.png";

export function BusinessMain() {
  const { t } = useTranslation();

  return (
    <main>
      <section className="container mx-auto grid grid-cols-1 gap-x-20 px-4 md:px-10 py-8 gap-y-10 lg:grid-cols-2 grid-rows-2 lg:grid-rows-1 pt-16 md:py-32">
        <div className="flex flex-col justify-center animate-slide-up">
          <div>
            <h1 className="animate-slide-up text-h1 text-center text-black lg:text-start">
              <Trans i18nKey="pages.business.hero.titlePart1" />{" "}
              <span className="text-blue-700">
                <Trans i18nKey="pages.business.hero.titlePart2" />
              </span>
            </h1>
            <p className="animate-slide-up my-6 text-center lg:text-left sm:text-xl">{t("pages.business.hero.description")}</p>
          </div>
          <div className="animate-slide-up mt-4 flex gap-2 justify-center lg:justify-start">
            <a
              className="btn btn-vortex-primary"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("pages.business.hero.sdkIntegration")}
            </a>
            <div className="relative">
              <div className="animate-slide-up badge absolute top-[-10px] right-[-20px] z-20 bg-blue-700 text-white">
                {t("pages.business.hero.comingSoon")}
              </div>
              <button className="animate-slide-up btn btn-vortex-primary-inverse" disabled>
                {t("pages.business.hero.widgetIntegration")}
              </button>
            </div>
          </div>
        </div>

        <div className="relative flex justify-around items-center w-flex">
          <motion.img
            alt="Widget Snippet EUR"
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="cursor-pointer shadow-custom rounded-lg w-1/3 z-10 hover:z-30"
            draggable={false}
            initial={{ opacity: 0, scale: 0.9, y: 150 }}
            src={WidgetSnippetImageEUR}
            transition={{ delay: 0.45, duration: 0.25, ease: "easeOut" }}
            whileHover={{ scale: 1.15, transition: { duration: 0.1, ease: "easeOut" } }}
          />

          <motion.img
            alt="Widget Snippet Sell"
            animate={{ opacity: 1, scale: 1.15, y: 0 }}
            className="cursor-pointer shadow-custom rounded-lg w-1/3 z-20 hover:z-30"
            draggable={false}
            initial={{ opacity: 0, scale: 0.9, y: 150 }}
            src={WidgetSnippetImageSell}
            transition={{ delay: 0.25, duration: 0.25, ease: "easeOut" }}
            whileHover={{ scale: 1.25, transition: { duration: 0.1, ease: "easeOut" } }}
          />

          <motion.img
            alt="Widget Snippet BRL"
            animate={{ opacity: 1, scale: 1, y: 0 }}
            className="cursor-pointer shadow-custom rounded-lg w-1/3 z-10 hover:z-30"
            draggable={false}
            initial={{ opacity: 0, scale: 0.9, y: 150 }}
            src={WidgetSnippetImageBRL}
            transition={{ delay: 0.45, duration: 0.25, ease: "easeOut" }}
            whileHover={{ scale: 1.15, transition: { duration: 0.1, ease: "easeOut" } }}
          />
        </div>
      </section>
    </main>
  );
}
