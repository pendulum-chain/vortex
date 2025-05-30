import { Trans, useTranslation } from 'react-i18next';

export const HowToSell = () => {
  const { t } = useTranslation();

  const steps = [
    {
      id: 1,
      text: t('sections.howToSell.steps.1'),
    },
    {
      id: 2,
      text: t('sections.howToSell.steps.2'),
    },
    {
      id: 3,
      text: t('sections.howToSell.steps.3'),
    },
    {
      id: 4,
      text: t('sections.howToSell.steps.4'),
    },
  ];

  return (
    <section className="relative py-32 overflow-hidden bg-[radial-gradient(at_50%_50%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))]">
      <div className="container relative z-10 px-4 mx-auto mb-12">
        <div className="mb-12 text-center">
          <p className="text-4xl text-white md:text-4xl leading-[3rem]">
            <Trans i18nKey="sections.howToSell.title">
              How to sell cryptocurrency online <br className="hidden md:block" /> with Vortex Finance
            </Trans>
          </p>
        </div>
        <div className="relative flex justify-center">
          <div className="relative grid max-w-5xl grid-cols-1 gap-8 xs:grid-cols-2 lg:grid-cols-4">
            {steps.map((step, index) => (
              <div key={step.id} className="relative group">
                {index !== 0 && (
                  <>
                    <div className="hidden lg:block absolute bg-primary w-full h-[1px] top-1/4 -translate-x-1/2 z-[0]"></div>
                  </>
                )}
                {index !== steps.length - 1 && (
                  <div className="block lg:hidden absolute bg-primary/50 w-[1px] left-1/2 h-full top-1/3 -translate-x-1/2 z-[0]"></div>
                )}
                <div className="flex flex-col items-center relative z-[1]">
                  <div className="flex items-center justify-center w-18 h-18 mb-4 transition-all duration-300 border-2 border-blue-700 rounded-full shadow-lg bg-[radial-gradient(at_50%_50%,theme(colors.black),theme(colors.blue.950),theme(colors.black)_134%)] group-hover:scale-105">
                    <span className="text-xl font-bold text-white">0{step.id}</span>
                  </div>
                  <div className="text-center transition-all duration-300 group-hover:transform group-hover:translate-y-1">
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
