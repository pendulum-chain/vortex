import { Link } from "@tanstack/react-router";
import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import { AnimatedTitle } from "../../../components/AnimatedTitle";
import { Globe } from "../../../components/Globe";
import { fadeInUp, prefersReducedMotion, staggerContainer } from "../../../constants/animations";

export const Hero = () => {
  const { t } = useTranslation();
  const reducedMotion = prefersReducedMotion();

  return (
    <section
      aria-label={t("pages.main.hero.title")}
      className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 lg:py-40"
    >
      <div className="container mx-auto flex flex-col gap-x-20 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1fr] lg:gap-y-10">
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
            <Link className="w-1/2 sm:w-1/3 lg:w-1/2 xl:w-2/5" to="/{-$locale}/widget">
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
            <Link className="w-1/2 sm:w-1/3 lg:w-1/2 xl:w-2/5" to="/{-$locale}/business">
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
          aria-label="Interactive globe showing supported countries"
          className="relative min-h-[280px] lg:mx-0 lg:min-h-[400px]"
          role="img"
        >
          <Globe />
        </div>
      </div>
    </section>
  );
};
