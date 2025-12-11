import { motion } from "motion/react";
import { listItemVariants, prefersReducedMotion } from "../../constants/animations";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  iconAlt?: string;
}

/**
 * FeatureCard - A simple feature card with icon, title, and description
 * Features:
 * - Fade-in animation on scroll
 * - Hover scale effect
 * - WCAG accessible
 * - Respects prefers-reduced-motion
 */
export const FeatureCard = ({ icon, title, description, iconAlt }: FeatureCardProps) => {
  const reducedMotion = prefersReducedMotion();

  return (
    <motion.article
      className="flex flex-col items-center lg:items-start lg:text-left"
      initial={reducedMotion ? "visible" : "hidden"}
      transition={{ duration: 0.5 }}
      variants={listItemVariants}
      viewport={{ once: true }}
      whileInView="visible"
    >
      <motion.div
        className="flex h-[70px] w-[70px] cursor-pointer items-center justify-center rounded-2xl border-1 border-gray-100 shadow-xl"
        transition={{ stiffness: 300, type: "spring" }}
        whileHover={reducedMotion ? undefined : { scale: 1.05 }}
      >
        <img alt={iconAlt || `${title} icon`} className="filter-primary mx-auto h-[28px] w-[28px] text-primary" src={icon} />
      </motion.div>
      <h3 className="mt-6 font-bold text-blue-900 text-h3">{title}</h3>
      <p className="mt-3 px-10 text-center text-body text-gray-500 lg:px-0 lg:text-left">{description}</p>
    </motion.article>
  );
};
