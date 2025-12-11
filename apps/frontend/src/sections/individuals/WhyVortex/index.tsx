import { motion } from "motion/react";
import { Trans, useTranslation } from "react-i18next";

import COFFEE from "../../../assets/why-vortex/coffee.svg";
import LOCK from "../../../assets/why-vortex/lock.svg";
import PERCENT from "../../../assets/why-vortex/percent.svg";
import USER_CHECK from "../../../assets/why-vortex/user-check.svg";
import { FeatureCard } from "../../../components/FeatureCard";

interface Feature {
  icon: string;
  title: string;
  description: string;
}

export const WhyVortex = () => {
  const { t } = useTranslation();

  const features: Feature[] = [
    {
      description: t("sections.whyVortex.features.lowFees.description"),
      icon: PERCENT,
      title: t("sections.whyVortex.features.lowFees.title")
    },
    {
      description: t("sections.whyVortex.features.easyToUse.description"),
      icon: COFFEE,
      title: t("sections.whyVortex.features.easyToUse.title")
    },
    {
      description: t("sections.whyVortex.features.securityFirst.description"),
      icon: LOCK,
      title: t("sections.whyVortex.features.securityFirst.title")
    },
    {
      description: t("sections.whyVortex.features.smartKYC.description"),
      icon: USER_CHECK,
      title: t("sections.whyVortex.features.smartKYC.title")
    }
  ];

  return (
    <section className="container relative mx-auto mb-16 grid grid-cols-1 gap-x-20 px-4 pt-16 sm:px-8 lg:mb-32 lg:grid-cols-2 lg:pt-32">
      <motion.h2
        animate={{ x: 0 }}
        className="text-center text-black text-h2 lg:sticky lg:top-24 lg:h-[200px] lg:text-left"
        initial={{ x: -50 }}
        transition={{ duration: 0.6 }}
        viewport={{ once: true }}
      >
        {t("sections.whyVortex.title")}{" "}
        <Trans i18nKey="sections.whyVortex.withVortexFinance">
          with <strong className="text-primary">Vortex</strong>?
        </Trans>
      </motion.h2>
      <div className="mt-12 grid grid-cols-1 gap-x-20 gap-y-8 md:grid-cols-2 lg:mt-0">
        {features.map(feature => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
};
