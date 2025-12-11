import { motion } from "motion/react";
import { prefersReducedMotion } from "../../constants/animations";

interface FeatureCardProps {
  icon: string;
  title: string;
  description: string;
  iconAlt?: string;
}

export const FeatureCard = ({ icon, title, description, iconAlt }: FeatureCardProps) => {
  const reducedMotion = prefersReducedMotion();

  return (
    <article className="flex flex-col items-center lg:items-start lg:text-left">
      <motion.div
        className="flex h-[70px] w-[70px] cursor-pointer items-center justify-center rounded-2xl border-1 border-gray-100 shadow-xl hover:scale-102"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, scale: 1, transition: { duration: 0.2, ease: "easeOut" }, y: 0 }}
      >
        <img
          alt={iconAlt || `${title} icon`}
          className="filter-primary mx-auto h-[28px] w-[28px] text-primary"
          draggable={false}
          src={icon}
        />
      </motion.div>
      <motion.h3
        className="mt-6 font-bold text-blue-900 text-h3"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, scale: 1, transition: { delay: 0.2, duration: 0.2, ease: "easeOut" }, y: 0 }}
      >
        {title}
      </motion.h3>
      <motion.p
        className="mt-3 px-10 text-center text-body text-gray-500 lg:px-0 lg:text-left"
        initial={{ opacity: 0, scale: 0.9, y: 10 }}
        viewport={{ once: true }}
        whileInView={{ opacity: 1, scale: 1, transition: { delay: 0.4, duration: 0.2, ease: "easeOut" }, y: 0 }}
      >
        {description}
      </motion.p>
    </article>
  );
};
