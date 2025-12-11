import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import WidgetSnippetImage from "../../../assets/widget-snippet.png";
import WidgetSnippetImageSell from "../../../assets/widget-snippet-sell.png";
import { AnimatedTitle } from "../../../components/AnimatedTitle";
import { fadeInUp, prefersReducedMotion, staggerContainer } from "../../../constants/animations";

export const Hero = () => {
  const { t } = useTranslation();
  const reducedMotion = prefersReducedMotion();

  return (
    <section
      aria-label={t("pages.main.hero.title")}
      className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 lg:py-32"
    >
      <div className="container mx-auto flex flex-col gap-x-20 gap-y-10 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1fr]">
        <div className="flex flex-col gap-6">
          <motion.h1
            animate="visible"
            className="pt-8 text-center font-bold text-h1 text-white lg:pt-0 lg:text-start"
            initial={reducedMotion ? "visible" : "hidden"}
            style={{ perspective: "1000px" }}
            variants={staggerContainer}
          >
            <AnimatedTitle text={t("pages.main.hero.title")} />
          </motion.h1>
          <motion.p
            animate="visible"
            className="text-center text-body-lg text-white lg:text-left"
            custom={0.45}
            initial={reducedMotion ? "visible" : "hidden"}
            variants={fadeInUp}
          >
            <Trans i18nKey="pages.main.hero.subtitle" />
          </motion.p>
          <div className="mt-2 flex w-full justify-center gap-x-4 lg:justify-start">
            <Link className="w-1/3" to="/{-$locale}/widget">
              <motion.div
                animate="visible"
                aria-label={t("pages.main.hero.buyAndSellCrypto")}
                className="btn btn-vortex-primary w-full"
                custom={0.55}
                initial={reducedMotion ? "visible" : "hidden"}
                rel="noopener noreferrer"
                variants={fadeInUp}
              >
                {t("pages.main.hero.buyAndSellCrypto")}
              </motion.div>
            </Link>
            <Link className="w-1/3" to="/{-$locale}/business">
              <motion.div
                animate="visible"
                aria-label={t("pages.main.hero.partnerWithUs")}
                className="btn btn-vortex-primary-inverse w-full"
                custom={0.65}
                initial={reducedMotion ? "visible" : "hidden"}
                role="button"
                tabIndex={0}
                variants={fadeInUp}
              >
                {t("pages.main.hero.partnerWithUs")}
              </motion.div>
            </Link>
          </div>
        </div>
        <div
          aria-label="Vortex widget preview demonstration"
          className="relative mx-auto flex flex-col items-center justify-center pt-2 md:w-4/5 lg:mx-0 lg:w-full xl:w-4/5"
          role="img"
        >
          <div className="relative overflow-hidden pt-2">
            <motion.img
              alt="Vortex cryptocurrency widget interface for buying crypto"
              animate={{ opacity: 1, rotateX: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" }, y: 0 }}
              className="relative z-20 mx-auto max-w-4/5 shadow-custom"
              initial={{ opacity: 0.4, rotateX: "120deg", scale: 0.9, y: 350 }}
              src={WidgetSnippetImage}
              whileHover={reducedMotion ? undefined : { scale: 1.01 }}
            />
            <motion.img
              alt="Vortex cryptocurrency widget interface for selling crypto"
              animate={{
                opacity: 1,
                rotateZ: 5,
                scale: 1,
                transition: {
                  damping: 18,
                  delay: 0.5,
                  stiffness: 320,
                  type: "spring"
                }
              }}
              className="-translate-x-1/2 -translate-y-1/2 absolute top-2/3 left-4/7 z-10 max-w-4/5 shadow-custom hover:z-30"
              initial={{ opacity: 0, rotateZ: 0, scale: 0.8 }}
              src={WidgetSnippetImageSell}
              whileHover={reducedMotion ? undefined : { rotateZ: 2, scale: 1.01 }}
            />
          </div>
          <div className="relative z-20 flex w-full items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5"></div>
        </div>
      </div>
    </section>
  );
};
