import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
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

export const WhyVortexBusiness = () => {
  const { t } = useTranslation();

  const features: Feature[] = [
    {
      description: t("pages.business.whyVortexBusiness.features.newRevenueStream.description"),
      icon: PERCENT,
      title: t("pages.business.whyVortexBusiness.features.newRevenueStream.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.fastPayouts.description"),
      icon: COFFEE,
      title: t("pages.business.whyVortexBusiness.features.fastPayouts.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.compliance.description"),
      icon: LOCK,
      title: t("pages.business.whyVortexBusiness.features.compliance.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.pricing.description"),
      icon: USER_CHECK,
      title: t("pages.business.whyVortexBusiness.features.pricing.title")
    }
  ];

  return (
    <section className="container relative mx-auto mb-16 grid grid-cols-1 gap-x-20 px-4 pt-16 sm:px-8 lg:mb-32 lg:grid-cols-2 lg:pt-32">
      <div className="text-center text-black text-h2 lg:sticky lg:top-24 lg:h-[200px] lg:text-left">
        <motion.h2 animate={{ x: 0 }} initial={{ x: -50 }} transition={{ duration: 0.6 }} viewport={{ once: true }}>
          {t("pages.business.whyVortexBusiness.title")} <br className="hidden lg:block" />
          {t("pages.business.whyVortexBusiness.title2")}
        </motion.h2>{" "}
        <p className="mt-6 text-center text-body-lg md:mb-16 md:text-left">{t("pages.business.whyVortexBusiness.subtitle")}</p>
      </div>
      <div className="mt-12 grid grid-cols-1 gap-x-20 gap-y-8 md:grid-cols-2 lg:mt-0">
        {features.map(feature => (
          <FeatureCard key={feature.title} {...feature} />
        ))}
      </div>
    </section>
  );
};
