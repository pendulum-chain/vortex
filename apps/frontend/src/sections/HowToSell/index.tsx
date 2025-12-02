import { Trans, useTranslation } from "react-i18next";

export const HowToSell = () => {
  const { t } = useTranslation();

  const steps = [
    {
      id: 1,
      text: t("sections.howToSell.steps.1")
    },
    {
      id: 2,
      text: t("sections.howToSell.steps.2")
    },
    {
      id: 3,
      text: t("sections.howToSell.steps.3")
    },
    {
      id: 4,
      text: t("sections.howToSell.steps.4")
    }
  ];

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(at_50%_50%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] py-16 lg:py-32">
      <div className="container relative z-10 mx-auto mb-12 px-4 md:px-10">
        <div className="mb-12 text-center">
          <p className="text-h2 text-white leading-[3rem]">
            <Trans i18nKey="sections.howToSell.title">
              How to sell crypto <span className="text-blue-400"> with Vortex </span>
            </Trans>
          </p>
        </div>
        <div className="relative flex justify-center">
          <div className="relative grid max-w-5xl grid-cols-1 xs:grid-cols-2 gap-8 lg:grid-cols-4">
            {steps.map((step, index) => (
              <div className="group relative" key={step.id}>
                {index !== 0 && (
                  <>
                    <div className="-translate-x-1/2 absolute top-1/4 z-[0] hidden h-[1px] w-full bg-primary lg:block"></div>
                  </>
                )}
                {index !== steps.length - 1 && (
                  <div className="-translate-x-1/2 absolute top-1/3 left-1/2 z-[0] block h-full w-[1px] bg-primary/50 lg:hidden"></div>
                )}
                <div className="relative z-[1] flex flex-col items-center">
                  <div className="mb-4 flex h-18 w-18 items-center justify-center rounded-full border-2 border-blue-700 bg-[radial-gradient(at_50%_50%,theme(colors.black),theme(colors.blue.950),theme(colors.black)_134%)] shadow-lg transition-all duration-300 group-hover:scale-105">
                    <span className="text-h3 text-white">0{step.id}</span>
                  </div>
                  <div className="text-center transition-all duration-300 group-hover:translate-y-1 group-hover:transform">
                    <p className="text-white/90">{step.text}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};
