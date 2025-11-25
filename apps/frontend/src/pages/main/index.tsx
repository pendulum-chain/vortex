import { Link } from "@tanstack/react-router";
import { Trans } from "react-i18next";
import WidgetSnippetImage from "../../assets/widget-snippet.png";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { BaseLayout } from "../../layouts";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

export const Main = () => {
  const isWidgetMode = useWidgetMode();
  useSetRampUrlParams();

  const main = (
    <main>
      {!isWidgetMode ? (
        <>
          <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] lg:py-32 px-4 md:px-10">
            <div className="container mx-auto grid grid-cols-1 gap-x-20 px-4 py-8 gap-y-10 lg:grid-cols-2">
              <div className="flex flex-col gap-6 animate-slide-up">
                <h1 className="text-h1 pt-8 text-center text-white lg:pt-0 lg:text-start font-bold">
                  <Trans i18nKey="pages.main.hero.title">
                    <span className="text-blue-400">Buy and Sell crypto</span> <br /> Fast, secure, best rates.
                  </Trans>
                </h1>
                <p className="text-body-lg text-center text-white lg:text-left">
                  <Trans i18nKey="pages.main.hero.subtitle" />
                </p>
              </div>
              <div className="animate-slide-up md:w-3/4 lg:w-full xl:w-3/4 flex justify-center flex-col items-center mx-auto lg:mx-0 ">
                <img
                  alt="Widget Snippet"
                  className="max-w-3/4 hover:scale-105 transition-all duration-300 cursor-pointer z-10"
                  src={WidgetSnippetImage}
                />
                <div className="bg-black rounded-lg p-4 px-8 flex w-full justify-center gap-4 items-center relative z-20">
                  <a
                    className="btn btn-vortex-primary w-1/2"
                    href="https://api-docs.vortexfinance.co/widgets/"
                    rel="noopener noreferrer"
                    target="_blank"
                  >
                    Buy and Sell Crypto
                  </a>
                  <Link className="btn btn-vortex-primary-inverse w-1/2" to="/{-$locale}/business">
                    Partner with us
                  </Link>
                </div>
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
