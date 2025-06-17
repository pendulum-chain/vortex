import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";

import COFFEE from "../../assets/why-vortex/coffee.svg";
import LOCK from "../../assets/why-vortex/lock.svg";
import PERCENT from "../../assets/why-vortex/percent.svg";
import USER_CHECK from "../../assets/why-vortex/user-check.svg";

interface Feature {
  icon: string;
  title: string;
  description: string;
}

const FeatureCard = ({ icon, title, description }: Feature) => (
  <motion.div
    initial={{ opacity: 0, y: 20 }}
    whileInView={{ opacity: 1, y: 0 }}
    transition={{ duration: 0.5 }}
    viewport={{ once: true }}
    className="flex flex-col items-center lg:items-start lg:text-left"
  >
    <motion.div
      className="flex h-[70px] w-[70px] items-center justify-center rounded-2xl border-1 border-gray-100 shadow-xl"
      whileHover={{ scale: 1.05 }}
      transition={{ type: "spring", stiffness: 300 }}
    >
      <img src={icon} alt={title} className="filter-primary mx-auto h-[28px] w-[28px] text-primary" />
    </motion.div>
    <h3 className="mt-6 font-bold text-blue-900 text-xl">{title}</h3>
    <p className="mt-3 px-10 text-center text-black text-gray-500 lg:px-0 lg:text-left">{description}</p>
  </motion.div>
);

export const WhyVortex = () => {
  const { t } = useTranslation();

  const features: Feature[] = [
    {
      icon: PERCENT,
      title: t("sections.whyVortex.features.lowFees.title"),
      description: t("sections.whyVortex.features.lowFees.description")
    },
    {
      icon: COFFEE,
      title: t("sections.whyVortex.features.easyToUse.title"),
      description: t("sections.whyVortex.features.easyToUse.description")
    },
    {
      icon: LOCK,
      title: t("sections.whyVortex.features.securityFirst.title"),
      description: t("sections.whyVortex.features.securityFirst.description")
    },
    {
      icon: USER_CHECK,
      title: t("sections.whyVortex.features.smartKYC.title"),
      description: t("sections.whyVortex.features.smartKYC.description")
    }
  ];

  return (
    <motion.section className="container mx-auto pb-24">
      <div className="relative grid grid-cols-1 lg:grid-cols-2">
        <motion.h1
          className="text-center text-3xl text-black sm:text-5xl lg:sticky lg:top-24 lg:h-[100px] lg:pl-4 lg:text-left lg:text-4xl"
          initial={{ x: -50 }}
          animate={{ x: 0 }}
          transition={{ duration: 0.6 }}
          viewport={{ once: true }}
        >
          {t("sections.whyVortex.title")}
          <br className="hidden lg:block" />{" "}
          <Trans i18nKey="sections.whyVortex.withVortexFinance">
            with <strong className="text-primary">Vortex Finance</strong>?
          </Trans>
        </motion.h1>
        <div className="mt-12 grid grid-cols-1 gap-x-20 gap-y-8 md:grid-cols-2 lg:mt-0">
          {features.map(feature => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </motion.section>
  );
};
