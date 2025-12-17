import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import WidgetSnippetImageEUR from "../../../assets/vortex-metamask.png";
import { AnimatedTitle } from "../../../components/AnimatedTitle";
import { fadeInUp, prefersReducedMotion, staggerContainer } from "../../../constants/animations";

export function Hero() {
  const { t } = useTranslation();
  const reducedMotion = prefersReducedMotion();

  return (
    <main>
      <section
        aria-label={t("pages.business.hero.title")}
        className="relative overflow-hidden bg-gradient-to-b from-white to-blue-50 py-24 lg:py-32"
      >
        <div className="container mx-auto flex flex-col gap-x-20 gap-y-10 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1.8fr]">
          <div className="flex flex-col gap-6">
            <motion.h1
              animate="visible"
              className="text-center font-bold text-gray-800 text-h2 lg:pt-0 lg:text-start"
              initial={reducedMotion ? "visible" : "hidden"}
              style={{ perspective: "1000px" }}
              variants={staggerContainer}
            >
              <AnimatedTitle highlightColor="text-blue-700" text={t("pages.business.hero.title")} />
            </motion.h1>
            <motion.p
              animate="visible"
              className="text-center text-body-lg lg:text-left"
              custom={0.45}
              initial={reducedMotion ? "visible" : "hidden"}
              variants={fadeInUp}
            >
              {t("pages.business.hero.description")}
            </motion.p>

            <div className="mt-2 flex justify-center gap-x-4 lg:justify-start">
              <motion.a
                animate="visible"
                aria-label={t("pages.business.hero.contactUs")}
                className="btn btn-vortex-primary w-1/2 xl:w-2/5"
                custom={0.55}
                href="mailto:business@vortexfinance.co"
                initial={reducedMotion ? "visible" : "hidden"}
                rel="noopener noreferrer"
                target="_blank"
                variants={fadeInUp}
              >
                {t("pages.business.hero.contactUs")} <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
              </motion.a>
              <motion.a
                animate="visible"
                aria-label={t("pages.business.hero.readDocs")}
                className="btn btn-vortex-primary-inverse w-1/2 xl:w-2/5"
                custom={0.65}
                href="https://api-docs.vortexfinance.co/"
                initial={reducedMotion ? "visible" : "hidden"}
                rel="noopener noreferrer"
                target="_blank"
                variants={fadeInUp}
              >
                {t("pages.business.hero.readDocs")} <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
              </motion.a>
            </div>
          </div>

          <div
            aria-label="Vortex business integration with MetaMask wallet demonstration"
            className="mx-auto flex flex-col items-center justify-center pt-2 md:w-4/5 lg:mx-0 xl:w-full"
            role="img"
          >
            <img
              alt="Vortex integration with MetaMask wallet showing EUR cryptocurrency transaction interface"
              className="z-10 rounded-lg shadow-custom lg:absolute lg:top-1/6 lg:right-[-230px] lg:w-full lg:max-w-[780px] xl:static"
              draggable={false}
              src={WidgetSnippetImageEUR}
            />
          </div>
        </div>
      </section>
    </main>
  );
}
