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
          <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] lg:py-32">
            <div className="container mx-auto grid grid-cols-1 gap-x-20 py-8 gap-y-10 lg:grid-cols-[1fr_1fr] px-4 sm:px-8">
              <div className="flex flex-col gap-6">
                <motion.h1
                  animate="visible"
                  className="text-h1 pt-8 text-center text-white lg:pt-0 lg:text-start font-bold"
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
                <p className="text-body-lg text-center text-white lg:text-left">
                  <Trans i18nKey="pages.main.hero.subtitle" />
                </p>
                <div className="flex gap-x-12">
                  <a
                    className="btn btn-vortex-primary flex-1"
                    href="https://api-docs.vortexfinance.co/widgets/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Buy and Sell Crypto
                  </a>
                  <Link className="btn btn-vortex-primary-inverse flex-1" to="/{-$locale}/business">
                    Partner with us
                  </Link>
                </div>
              </div>
              <div className="md:w-4/5 lg:w-full xl:w-4/5 flex justify-center pt-2 flex-col items-center mx-auto lg:mx-0 relative">
                <div className="overflow-hidden relative pt-2">
                  <motion.img
                    alt="Widget Snippet"
                    animate={{ opacity: 1, rotateX: 0, scale: 1, transition: { duration: 0.3, ease: "easeOut" }, y: 0 }}
                    className="max-w-4/5 z-20 relative shadow-custom mx-auto"
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
                    className="max-w-4/5 z-10 absolute top-2/3 left-4/7 -translate-x-1/2 -translate-y-1/2 shadow-custom hover:z-30"
                    initial={{ opacity: 0, rotateZ: 0, scale: 0.8 }}
                    src={WidgetSnippetImageSell}
                    whileHover={{ rotateZ: 2, scale: 1.01 }}
                  />
                </div>
                <div className="bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 rounded-lg p-0.5 flex w-full justify-center gap-4 items-center relative z-20"></div>
                <div className="mt-2 hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 rounded-lg p-0.5 flex w-5/6 justify-center gap-4 items-center relative z-20 opacity-60"></div>
                <div className="mt-2 hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 rounded-lg p-0.5 flex w-4/6 justify-center gap-4 items-center relative z-20 opacity-40"></div>
                <div className="mt-2 hover:opacity-100 transition-opacity duration-300 bg-gradient-to-r from-blue-400 via-pink-700 to-blue-700 rounded-lg p-0.5 flex w-3/6 justify-center gap-4 items-center relative z-20 opacity-20"></div>
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
