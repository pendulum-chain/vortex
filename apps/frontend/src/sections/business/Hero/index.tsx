import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { Link } from "@tanstack/react-router";
import { motion, useReducedMotion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";
import WidgetSnippetImageEUR from "../../../assets/metawallet-vortex.png";
import { AnimatedTitle } from "../../../components/AnimatedTitle";
import { fadeInUp, staggerContainer } from "../../../constants/animations";

const heroImageVariants: Variants = {
  hidden: {
    opacity: 0,
    scale: 0.92,
    y: 40
  },
  visible: {
    opacity: 1,
    scale: 1,
    transition: {
      damping: 25,
      delay: 0.3,
      duration: 0.8,
      ease: [0.25, 0.46, 0.45, 0.94],
      stiffness: 100,
      type: "spring"
    },
    y: 0
  }
};

export function Hero() {
  const { t } = useTranslation();
  const reducedMotion = useReducedMotion();

  return (
    <main>
      <section
        aria-label={t("pages.business.hero.title")}
        className="overflow-hidden bg-gradient-to-b from-white to-blue-50 py-24 lg:py-32"
      >
        <div className="container relative mx-auto flex flex-col gap-x-20 gap-y-10 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1.8fr]">
          <motion.div
            className="flex flex-col gap-6"
            initial={reducedMotion ? "visible" : "hidden"}
            viewport={{ amount: 0.3, once: true }}
            whileInView="visible"
          >
            <motion.h1
              className="text-center font-bold text-gray-800 text-h2 lg:pt-0 lg:text-start"
              style={{ perspective: "1000px" }}
              variants={staggerContainer}
            >
              <AnimatedTitle highlightColor="text-blue-700" text={t("pages.business.hero.title")} />
            </motion.h1>
            <motion.p className="text-center text-body-lg lg:text-left" custom={0.45} variants={fadeInUp}>
              {t("pages.business.hero.description")}
            </motion.p>

            <div className="mt-2 flex justify-center gap-x-4 lg:justify-start">
              <Link className="w-1/2 sm:w-1/3 lg:w-1/2 xl:w-2/5" to="/{-$locale}/contact">
                <motion.div
                  animate="visible"
                  aria-label={t("pages.business.hero.contactUs")}
                  className="btn btn-vortex-primary w-full"
                  custom={0.55}
                  initial={reducedMotion ? "visible" : "hidden"}
                  variants={fadeInUp}
                >
                  {t("pages.business.hero.contactUs")}
                </motion.div>
              </Link>
              <motion.a
                aria-label={t("pages.business.hero.readDocs")}
                className="btn btn-vortex-primary-inverse w-1/2 sm:w-1/3 lg:w-1/2 xl:w-2/5"
                custom={0.65}
                href="https://api-docs.vortexfinance.co/"
                rel="noopener noreferrer"
                target="_blank"
                variants={fadeInUp}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                {t("pages.business.hero.readDocs")} <ArrowTopRightOnSquareIcon aria-hidden="true" className="h-4 w-4" />
              </motion.a>
            </div>
          </motion.div>

          <motion.div
            aria-label="Vortex business integration with MetaMask wallet demonstration"
            className="mx-auto flex flex-col items-center justify-center pt-2 md:w-4/5 lg:mx-0 xl:w-full"
            initial={reducedMotion ? "visible" : "hidden"}
            role="img"
            viewport={{ amount: 0.2, once: true }}
            whileInView="visible"
          >
            <motion.div
              className="relative z-10 lg:absolute lg:top-0 lg:right-[-200px] lg:right-[-230px] lg:w-full lg:max-w-[780px] xl:right-0"
              variants={heroImageVariants}
            >
              <img
                alt="Vortex integration with MetaMask wallet showing EUR cryptocurrency transaction interface"
                className="rounded-lg shadow-2xl"
                draggable={false}
                src={WidgetSnippetImageEUR}
              />
              <motion.div
                animate={reducedMotion ? undefined : { opacity: [0.15, 0.25, 0.15], scale: [1, 1.02, 1] }}
                className="-z-10 absolute inset-0 translate-y-4 rounded-lg bg-blue-500/20 blur-2xl"
                transition={{
                  duration: 4,
                  ease: "easeInOut",
                  repeat: Infinity,
                  repeatType: "loop"
                }}
              />
            </motion.div>
          </motion.div>
        </div>
      </section>
    </main>
  );
}
