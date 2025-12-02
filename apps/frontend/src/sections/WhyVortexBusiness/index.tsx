import Lottie, { LottieOptions, LottieRefCurrentProps } from "lottie-react";
import { motion } from "motion/react";
import { useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";

import CLOCK from "../../assets/lottie/clock.json";
import COIN from "../../assets/lottie/coin.json";
import DOCUMENT from "../../assets/lottie/document.json";
import EYE from "../../assets/lottie/eye.json";

interface Feature {
  icon: LottieOptions["animationData"];
  title: string;
  description: string;
}

interface FeatureCardProps extends Feature {
  index: number;
}

const FeatureCard = ({ icon, title, description, index }: FeatureCardProps) => {
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

  const startX = index % 2 === 0 ? -200 : 200;
  const startRotateZ = index % 2 === 0 ? -15 : 15;

  return (
    <motion.li
      className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-950 shadow-xs"
      initial={{ rotateZ: startRotateZ, scale: 0.9, x: startX, y: 20 }}
      onMouseEnter={handleMouseEnter}
      ref={cardRef}
      transition={{ duration: 0.4 }}
      viewport={{ margin: "0px 0px -20px 0px" }}
      whileInView={{ rotateZ: 0, scale: 1, x: 0, y: 0 }}
    >
      <div className="flex h-full justify-between">
        <div className="h-full w-3/5 bg-gray-50 px-8 py-12">
          <h3 className="mt-6 font-bold text-blue-900 text-xl">{title}</h3>
          <div className="my-6 h-[1px] w-full bg-gray-200" />
          <p className="mt-3 px-10 text-center text-black text-gray-500 lg:px-0 lg:text-left">{description}</p>
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

export const WhyVortexBusiness = () => {
  const { t } = useTranslation();

  const features: Feature[] = [
    {
      description: t("pages.business.whyVortexBusiness.features.newRevenueStream.description"),
      icon: COIN,
      title: t("pages.business.whyVortexBusiness.features.newRevenueStream.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.fastPayouts.description"),
      icon: CLOCK,
      title: t("pages.business.whyVortexBusiness.features.fastPayouts.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.compliance.description"),
      icon: DOCUMENT,
      title: t("pages.business.whyVortexBusiness.features.compliance.title")
    },
    {
      description: t("pages.business.whyVortexBusiness.features.pricing.description"),
      icon: EYE,
      title: t("pages.business.whyVortexBusiness.features.pricing.title")
    }
  ];

  return (
    <section className="container mx-auto py-16 md:py-32 lg:px-10">
      <div className="relative flex flex-col items-center justify-center">
        <h1 className="text-center text-gray-900 text-h2 lg:pt-0 lg:text-start">
          {t("pages.business.whyVortexBusiness.title")}
        </h1>
        <p className="mt-6 text-center md:mb-16 md:text-left">{t("pages.business.whyVortexBusiness.subtitle")}</p>
        <ul className="mt-12 grid grid-cols-1 gap-x-6 gap-y-6 lg:mt-0 lg:grid-cols-2 ">
          {features.map((feature, index) => (
            <FeatureCard key={feature.title} {...feature} index={index} />
          ))}
        </ul>
      </div>
    </section>
  );
};
