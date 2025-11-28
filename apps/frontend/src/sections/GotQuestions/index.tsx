import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";
import PLANET from "../../assets/planet.svg";

const FORM_URL = "https://forms.gle/dKh8ckXheRPdRa398";

export const GotQuestions = () => {
  const { t } = useTranslation();

  return (
    <section className="overflow-hidden bg-blue-900 px-4 md:px-10 py-32 text-white">
      <div className="relative mx-auto flex flex-col justify-between sm:container md:flex-row">
        <motion.img
          alt="Planet"
          className="absolute left-0 w-full md:w-1/2"
          initial={{ opacity: 0, rotate: -30, x: -100, y: 100 }}
          src={PLANET}
          transition={{ duration: 0.8, ease: "easeOut" }}
          viewport={{ once: true }}
          whileHover={{ scale: 1.02 }}
          whileInView={{ opacity: 1, rotate: 0, x: 0, y: 0 }}
        />
        <div className="z-10 md:w-1/2">
          <h1 className="text-h1 md:text-start text-center font-bold md:font-normal">
            <Trans i18nKey="sections.gotQuestions.title">
              Got Questions? <br /> We're here to help!
            </Trans>
          </h1>
        </div>
        <div className="z-10 flex flex-col md:w-1/2 md:items-end justify-center">
          <p className="text-body-lg mt-3 mb-4 md:mt-0 md:text-end text-center">{t("sections.gotQuestions.description")}</p>
          <a className="btn btn-vortex-secondary mx-auto flex items-center gap-2 rounded-3xl px-6 md:mx-0" href={FORM_URL}>
            <span>{t("sections.gotQuestions.contactUs")}</span>
            <PlayCircleIcon className="w-5 group-hover:text-pink-600" />
          </a>
        </div>
      </div>
    </section>
  );
};
