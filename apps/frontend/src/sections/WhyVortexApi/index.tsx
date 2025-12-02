import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import quoteRequestPreview from "../../assets/quote-request-preview.mp4";

export function WhyVortexApi() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] px-4 py-16 md:px-10 md:py-32">
      <div className="container mx-auto">
        <div className="flex animate-slide-up flex-col items-center justify-center">
          <h1 className="pt-8 text-center text-h2 text-white">{t("pages.business.whyVortexApi.title1")}</h1>
          <h1 className="pt-2 text-center text-blue-400 text-h2 lg:pt-0 lg:text-start">
            {t("pages.business.whyVortexApi.title2")}
          </h1>
        </div>

        <div className="grid grid-cols-1 items-center justify-center gap-x-20 gap-y-10 lg:grid-cols-[1fr_2fr]">
          <ul>
            <li>
              <div className="mt-6 flex items-center gap-2">
                <CheckCircleIcon className="h-6 w-6 text-blue-400" />
                <h2 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.automated.title")}
                </h2>
              </div>
              <p className="mt-3 px-10 text-center text-body text-white lg:px-0 lg:text-left">
                {t("pages.business.whyVortexApi.features.automated.description")}
              </p>
            </li>
            <li>
              <div className="mt-6 flex items-center gap-2">
                <CheckCircleIcon className="h-6 w-6 text-blue-400" />
                <h2 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.pricing.title")}
                </h2>
              </div>
              <p className="mt-3 px-10 text-center text-body text-white lg:px-0 lg:text-left">
                {t("pages.business.whyVortexApi.features.pricing.description")}
              </p>
            </li>
            <li>
              <div className="mt-6 flex items-center gap-2">
                <CheckCircleIcon className="h-6 w-6 text-blue-400" />
                <h2 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.liquidity.title")}
                </h2>
              </div>
              <p className="mt-3 px-10 text-center text-body text-white lg:px-0 lg:text-left">
                {t("pages.business.whyVortexApi.features.liquidity.description")}
              </p>
            </li>
          </ul>
          <div className="mt-0 md:mt-12">
            <video
              aria-label="Quote request preview"
              autoPlay
              className="rounded-xl"
              controls={false}
              loop
              muted
              playsInline
              src={quoteRequestPreview}
            />
            <p className="mt-3 px-10 text-center text-h3 text-white lg:px-0 lg:text-left">
              {t("pages.business.whyVortexApi.cta.title")}
            </p>
            <div className="mt-6 flex items-center justify-center gap-2">
              <a
                className="btn btn-vortex-primary px-10 text-white"
                href="https://api-docs.vortexfinance.co/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("pages.business.whyVortexApi.cta.readDocs")}
              </a>
              <a
                className="btn btn-vortex-primary-inverse px-10"
                href="https://www.npmjs.com/package/@vortexfi/sdk"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("pages.business.whyVortexApi.cta.npmPackage")}
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
