import { ArrowTopRightOnSquareIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { useTranslation } from "react-i18next";
import quoteRequestPreview from "../../assets/quote-request-preview.mov";

export function WhyVortexApi() {
  const { t } = useTranslation();

  return (
    <section className="relative overflow-hidden bg-[radial-gradient(at_74%_98%,theme(colors.blue.900),theme(colors.blue.950),theme(colors.blue.950))] px-4 py-16 sm:py-32 md:px-10">
      <div className="container mx-auto grid grid-cols-1 gap-12 lg:gap-16">
        <div className="flex animate-slide-up flex-col">
          <h1 className="text-center font-bold text-h2 text-white">
            {t("pages.business.whyVortexApi.title1")} <br />
            <strong className="text-blue-400">{t("pages.business.whyVortexApi.title2")}</strong>
          </h1>

          <ul className="mt-16 grid grid-cols-1 gap-8 sm:grid-cols-3">
            <li>
              <div className="flex gap-2 ">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className=" font-bold text-blue-400 text-h3 ">
                  {t("pages.business.whyVortexApi.features.automated.title")}
                </h3>
              </div>
              <p className="mt-2 text-body-lg text-white ">{t("pages.business.whyVortexApi.features.automated.description")}</p>
            </li>
            <li>
              <div className="flex gap-2 ">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className=" font-bold text-blue-400 text-h3 ">{t("pages.business.whyVortexApi.features.pricing.title")}</h3>
              </div>
              <p className="mt-2 text-body-lg text-white ">{t("pages.business.whyVortexApi.features.pricing.description")}</p>
            </li>
            <li>
              <div className="flex gap-2 ">
                <CheckCircleIcon className="h-6 w-6 shrink-0 text-blue-400" />
                <h3 className=" font-bold text-blue-400 text-h3 ">
                  {t("pages.business.whyVortexApi.features.liquidity.title")}
                </h3>
              </div>
              <p className="mt-2 text-body-lg text-white ">{t("pages.business.whyVortexApi.features.liquidity.description")}</p>
            </li>
          </ul>
        </div>
        <div className="flex flex-col items-center justify-center">
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
          <p className="my-8 text-body-lg text-white">{t("pages.business.whyVortexApi.cta.title")}</p>
          <div className="flex items-center justify-center gap-4">
            <a
              className="btn btn-vortex-primary text-white md:px-10"
              href="https://api-docs.vortexfinance.co/"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("pages.business.whyVortexApi.cta.readDocs")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
            <a
              className="btn btn-vortex-primary-inverse md:px-10"
              href="https://www.npmjs.com/package/@vortexfi/sdk"
              rel="noopener noreferrer"
              target="_blank"
            >
              {t("pages.business.whyVortexApi.cta.npmPackage")} <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
