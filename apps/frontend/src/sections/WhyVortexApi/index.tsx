import { ArrowTopRightOnSquareIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import quoteRequestPreview from "../../assets/quote-request-preview.mov";

export function WhyVortexApi() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] px-4 py-16 md:px-10 lg:py-32">
      <div className="container mx-auto grid grid-cols-1 gap-12 lg:grid-cols-[1fr_1.8fr] lg:gap-16">
        <div className="flex animate-slide-up flex-col">
          <h1 className="font-bold text-h2 text-white">
            {t("pages.business.whyVortexApi.title1")} <br className="hidden lg:block" />
            <strong className="text-blue-400">{t("pages.business.whyVortexApi.title2")}</strong>
          </h1>

          <ul className="mt-16 grid grid-cols-1 gap-8 lg:gap-12">
            <li>
              <div className="flex items-center justify-center gap-2 lg:justify-start">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.automated.title")}
                </h3>
              </div>
              <p className="mt-2 text-center text-body-lg text-white lg:text-left">
                {t("pages.business.whyVortexApi.features.automated.description")}
              </p>
            </li>
            <li>
              <div className="flex items-center justify-center gap-2 lg:justify-start">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.pricing.title")}
                </h3>
              </div>
              <p className="mt-2 text-center text-body-lg text-white lg:text-left">
                {t("pages.business.whyVortexApi.features.pricing.description")}
              </p>
            </li>
            <li>
              <div className="flex items-center justify-center gap-2 lg:justify-start">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className="text-center font-bold text-blue-400 text-h3 lg:text-left">
                  {t("pages.business.whyVortexApi.features.liquidity.title")}
                </h3>
              </div>
              <p className="mt-2 text-center text-body-lg text-white lg:text-left">
                {t("pages.business.whyVortexApi.features.liquidity.description")}
              </p>
            </li>
          </ul>
        </div>
        <div className="flex flex-col">
          <div className="flex flex-col">
            <video
              aria-label="Quote request preview"
              autoPlay
              className="mx-auto w-full rounded-xl"
              controls={false}
              loop
              muted
              playsInline
              src={quoteRequestPreview}
            />
            <p className="mt-8 text-body-lg text-white">{t("pages.business.whyVortexApi.cta.title")}</p>
            <div className="mt-8 flex flex-col items-center gap-4 md:flex-row">
              <a
                className="btn btn-vortex-primary w-full text-white md:w-auto md:px-10"
                href="https://api-docs.vortexfinance.co/"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("pages.business.whyVortexApi.cta.readDocs")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
              <a
                className="btn btn-vortex-primary-inverse w-full md:w-auto md:px-10"
                href="https://www.npmjs.com/package/@vortexfi/sdk"
                rel="noopener noreferrer"
                target="_blank"
              >
                {t("pages.business.whyVortexApi.cta.npmPackage")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
