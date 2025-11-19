import { Trans } from "react-i18next";
import { useSetRampUrlParams } from "../../hooks/useRampUrlParams";
import { useWidgetMode } from "../../hooks/useWidgetMode";
import { BaseLayout } from "../../layouts";
import { Quote } from "../quote";
import { Ramp } from "../ramp";
import MainSections from "./MainSections";

export const Main = () => {
  const isWidgetMode = useWidgetMode();
  useSetRampUrlParams();

  const main = (
    <main>
      {!isWidgetMode ? (
        <>
          <div className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] pb-4">
            <div className="container mx-auto flex grow-1 flex-col items-center justify-between lg:flex-row">
              <div className="flex flex-col gap-4 mr-5">
                <div className="pt-8 text-center font-semibold text-3xl md:text-5xl text-white lg:text-6xl lg:pt-0 lg:text-start">
                  <Trans i18nKey="pages.main.hero.title">
                    <span className="text-blue-400">How to sell</span> cryptocurrency online <br /> with Vortex Finance
                  </Trans>
                </div>
                <p className="text-center sm:text-left text-white sm:text-lg">
                  <Trans i18nKey="pages.main.hero.subtitle" />
                </p>
              </div>
              <Quote />
            </div>
          </div>
          <MainSections />
        </>
      ) : (
        <Ramp />
      )}
    </main>
  );

  return <BaseLayout main={main} />;
};
