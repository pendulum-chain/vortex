import { Link } from "@tanstack/react-router";
import { motion, Variants } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import WidgetSnippetImage from "../../assets/widget-snippet.png";
import WidgetSnippetImageSell from "../../assets/widget-snippet-sell.png";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

const wordVariants: Variants = {
  hidden: { opacity: 0, rotateX: "90deg" as const, scale: 0.9, y: 10 },
  visible: {
    opacity: 1,
    rotateX: 0,
    scale: 1,
    transition: {
      duration: 0.6,
      ease: "easeOut" as const
    },
    y: 0
  }
};

const AnimatedTitle = ({ text }: { text: string }) => {
  const parts = text.split(/(<0>.*?<\/0>|<br\s*\/?>)/);

  return (
    <>
      {parts.map((part, partIndex) => {
        if (part.match(/^<0>.*?<\/0>$/)) {
          const text = part.replace(/<\/?0>/g, "");
          const words = text.split(/(\s+)/);
          return words.map((word, wordIdx) => {
            if (!word.trim()) {
              return <span key={`space-${partIndex}-${wordIdx}`}>{word}</span>;
            }
            return (
              <motion.span className="text-blue-400" key={`part-${partIndex}-word-${wordIdx}`} variants={wordVariants}>
                {word}
              </motion.span>
            );
          });
        } else if (part.match(/^<br\s*\/?>$/i)) {
          return <br key={`br-${partIndex}`} />;
        } else if (part.trim()) {
          const words = part.split(/(\s+)/);
          return words.map((word, wordIdx) => {
            if (!word.trim()) {
              return <span key={`space-${partIndex}-${wordIdx}`}>{word}</span>;
            }
            return (
              <motion.span key={`part-${partIndex}-word-${wordIdx}`} variants={wordVariants}>
                {word}
              </motion.span>
            );
          });
        }
        return null;
      })}
    </>
  );
};

export const Main = () => {
  const isWidgetMode = useWidgetMode();
  useSetRampUrlParams();
  const { t } = useTranslation();

  const main = (
    <main>
      {!isWidgetMode ? (
        <>
          <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 lg:py-32">
            <div className="container mx-auto flex flex-col gap-x-20 gap-y-10 px-4 sm:px-8 lg:grid lg:grid-cols-[1fr_1fr]">
              <div className="flex flex-col gap-6">
                <motion.h1
                  animate="visible"
                  className="pt-8 text-center font-bold text-h1 text-white lg:pt-0 lg:text-start"
                  initial="hidden"
                  variants={{
                    visible: {
                      transition: {
                        staggerChildren: 0.1
                      }
                    }
                  }}
                >
                  <AnimatedTitle text={t("pages.main.hero.title")} />
                </motion.h1>
                <p className="text-center text-body-lg text-white lg:text-left">
                  <Trans i18nKey="pages.main.hero.subtitle" />
                </p>
                <div className="flex w-full justify-center gap-x-4 lg:justify-start">
                  <a
                    className="btn btn-vortex-primary w-1/3"
                    href="https://api-docs.vortexfinance.co/widgets/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Buy & Sell Crypto
                  </a>
                  <Link className="btn btn-vortex-primary-inverse w-1/3" to="/{-$locale}/business">
                    Partner with us
                  </Link>
                </div>
              </div>
              <div className="relative mx-auto flex flex-col items-center justify-center pt-2 md:w-4/5 lg:mx-0 lg:w-full xl:w-4/5">
                <div className="relative overflow-hidden pt-2">
                  <motion.img
                    alt="Widget Snippet"
                    animate={{ opacity: 1, rotateX: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" }, y: 0 }}
                    className="relative z-20 mx-auto max-w-4/5 shadow-custom"
                    initial={{ opacity: 0.4, rotateX: "120deg", scale: 0.9, y: 350 }}
                    src={WidgetSnippetImage}
                    whileHover={{ scale: 1.01 }}
                  />
                  <motion.img
                    alt="Widget Snippet"
                    animate={{
                      opacity: 1,
                      rotateZ: 5,
                      scale: 1,
                      transition: {
                        damping: 18,
                        delay: 0.3,
                        stiffness: 320,
                        type: "spring"
                      }
                    }}
                    className="-translate-x-1/2 -translate-y-1/2 absolute top-2/3 left-4/7 z-10 max-w-4/5 shadow-custom hover:z-30"
                    initial={{ opacity: 0, rotateZ: 0, scale: 0.8 }}
                    src={WidgetSnippetImageSell}
                    whileHover={{ rotateZ: 2, scale: 1.01 }}
                  />
                </div>
                <div className="relative z-20 flex w-full items-center justify-center gap-4 rounded-lg bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 p-0.5"></div>
              </div>
            </div>
          </section>
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
