import Lottie, { LottieOptions, LottieRefCurrentProps } from "lottie-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import COFFEE from "../../assets/why-vortex/coffee.svg";
import LOCK from "../../assets/why-vortex/lock.svg";
import PERCENT from "../../assets/why-vortex/percent.svg";
import USER_CHECK from "../../assets/why-vortex/user-check.svg";

interface XFeature {
  icon: LottieOptions["animationData"];
  title: string;
  description: string;
}

interface XFeatureCardProps extends XFeature {
  index: number;
}

const _XFeatureCard = ({ icon, title, description, index }: XFeatureCardProps) => {
  const lottieRef = useRef<LottieRefCurrentProps>(null);
  const cardRef = useRef<HTMLLIElement>(null);
  const hasPlayedOnce = useRef(false);
  const isPlaying = useRef(false);

  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;

    const observer = new IntersectionObserver(
      entries => {
        entries.forEach(entry => {
          if (entry.isIntersecting && lottieRef.current && !hasPlayedOnce.current) {
            lottieRef.current.play();
            hasPlayedOnce.current = true;
            isPlaying.current = true;
          }
        });
      },
      { threshold: 0.7 }
    );

    observer.observe(card);

    return () => {
      observer.disconnect();
    };
  }, []);

  const handleMouseEnter = () => {
    if (lottieRef.current && !isPlaying.current) {
      lottieRef.current.stop();
      lottieRef.current.goToAndStop(0, true);
      lottieRef.current.setDirection(1);
      lottieRef.current.play();
      isPlaying.current = true;
    }
  };

  const handleAnimationComplete = () => {
    isPlaying.current = false;
  };

  const startX = index % 2 === 0 ? -40 : 40;
  const startRotateZ = index % 2 === 0 ? -15 : 15;

  return (
    <motion.li
      className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-950"
      initial={{ rotateZ: startRotateZ, scale: 0.9, x: startX, y: 20 }}
      onMouseEnter={handleMouseEnter}
      ref={cardRef}
      transition={{ duration: 0.4 }}
      viewport={{ margin: "0px 0px -20px 0px" }}
      whileInView={{ rotateZ: 0, scale: 1, x: 0, y: 0 }}
    >
      <div className="flex h-full justify-between">
        <div className="h-full w-3/5 bg-gray-50 px-4 py-8 md:px-8 md:py-12">
          <h3 className="mt-6 font-bold text-blue-900 text-xl">{title}</h3>
          <div className="my-6 h-[1px] w-full bg-gray-200" />
          <p className="mt-3 text-black text-gray-500 lg:px-0 ">{description}</p>
        </div>
        <div className="my-auto flex h-full w-2/5 items-center justify-center">
          <Lottie
            animationData={icon}
            autoplay={false}
            className="w-1/2"
            loop={false}
            lottieRef={lottieRef}
            onComplete={handleAnimationComplete}
          />
        </div>
      </div>
    </motion.li>
  );
};

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
      className="flex h-[70px] w-[70px] cursor-pointer items-center justify-center rounded-2xl border-1 border-gray-100 shadow-xl"
      transition={{ stiffness: 300, type: "spring" }}
      whileHover={{ scale: 1.05 }}
    >
      <img alt={title} className="filter-primary mx-auto h-[28px] w-[28px] text-primary " src={icon} />
    </motion.div>
    <h3 className="mt-6 font-bold text-blue-900 text-h3">{title}</h3>
    <p className="mt-3 px-10 text-center text-body text-gray-500 lg:px-0 lg:text-left">{description}</p>
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
    <section className="container mx-auto px-4 py-16 md:py-32 lg:px-10">
      <div className="relative flex flex-col items-center justify-center">
        <h1 className="text-center text-gray-900 text-h2 lg:pt-0 lg:text-start ">
          {t("pages.business.whyVortexBusiness.title")}
        </h1>
        <p className="mt-6 text-center md:mb-16 md:text-left">{t("pages.business.whyVortexBusiness.subtitle")}</p>
        <ul className="mt-12 grid grid-cols-1 gap-x-6 gap-y-6 lg:mt-0 lg:grid-cols-2 ">
          {features.map(feature => (
            <FeatureCard key={feature.title} {...feature} />
          ))}
        </ul>
      </div>
    </section>
  );
};
