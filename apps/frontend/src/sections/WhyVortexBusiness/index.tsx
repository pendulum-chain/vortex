import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

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
    className="flex flex-col items-center lg:items-start lg:text-left"
    initial={{ opacity: 0, y: 20 }}
    transition={{ duration: 0.5 }}
    viewport={{ once: true }}
    whileInView={{ opacity: 1, y: 0 }}
  >
    <motion.div
      className="flex h-[70px] w-[70px] items-center justify-center rounded-2xl border-1 border-gray-100 shadow-xl"
      transition={{ stiffness: 300, type: "spring" }}
      whileHover={{ scale: 1.05 }}
    >
      <img alt={title} className="filter-primary mx-auto h-[28px] w-[28px] text-primary" src={icon} />
    </motion.div>
    <h3 className="mt-6 font-bold text-blue-900 text-xl">{title}</h3>
    <p className="mt-3 px-10 text-center text-black text-gray-500 lg:px-0 lg:text-left">{description}</p>
  </motion.div>
);

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
    <section className="container mx-auto py-16 md:py-32">
      <div className="relative flex flex-col items-center justify-center">
        <h1 className="text-center text-gray-900 text-h2 lg:pt-0 lg:text-start">
          {t("pages.business.whyVortexBusiness.title")}
        </h1>
        <p className="mt-6 text-center md:mb-16 md:text-left">{t("pages.business.whyVortexBusiness.subtitle")}</p>
        <div className="mt-12 grid grid-cols-1 gap-x-20 gap-y-8 md:grid-cols-2 lg:mt-0">
          {features.map(feature => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </div>
      </div>
    </section>
  );
};
