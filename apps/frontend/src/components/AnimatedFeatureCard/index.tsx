import Lottie, { LottieOptions } from "lottie-react";
import { motion } from "motion/react";
import { featureCardVariants, prefersReducedMotion } from "../../constants/animations";
import { useLottieIntersectionAnimation } from "../../hooks/useLottieIntersectionAnimation";

interface AnimatedFeatureCardProps {
  icon: LottieOptions["animationData"];
  title: string;
  description: string;
  index: number;
  iconAriaLabel?: string;
}

/**
 * AnimatedFeatureCard - A card component with Lottie animation
 * Features:
 * - Animates on scroll into view
 * - Plays animation on hover
 * - Alternating entrance direction based on index
 * - Full WCAG accessibility support
 * - Respects prefers-reduced-motion
 */
export const AnimatedFeatureCard = ({ icon, title, description, index, iconAriaLabel }: AnimatedFeatureCardProps) => {
  const { lottieRef, cardRef, handleMouseEnter, handleAnimationComplete } = useLottieIntersectionAnimation();

  const reducedMotion = prefersReducedMotion();

  return (
    <motion.li
      aria-label={title}
      className="rounded-xl bg-gradient-to-r from-blue-900 to-blue-950"
      custom={index}
      initial={reducedMotion ? "visible" : "hidden"}
      onMouseEnter={handleMouseEnter}
      ref={cardRef as React.RefObject<HTMLLIElement>}
      role="article"
      transition={{ duration: 0.4 }}
      variants={featureCardVariants}
      viewport={{ margin: "0px 0px -20px 0px" }}
      whileInView="visible"
    >
      <div className="flex h-full justify-between">
        <div className="h-full w-3/5 bg-gray-50 px-4 py-8 md:px-8 md:py-12">
          <h3 className="mt-6 font-bold text-blue-900 text-xl">{title}</h3>
          <div aria-hidden="true" className="my-6 h-[1px] w-full bg-gray-200" />
          <p className="mt-3 text-gray-500 lg:px-0">{description}</p>
        </div>
        <div aria-label={iconAriaLabel || title} className="my-auto flex h-full w-2/5 items-center justify-center" role="img">
          <Lottie
            animationData={icon}
            aria-hidden="true"
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
