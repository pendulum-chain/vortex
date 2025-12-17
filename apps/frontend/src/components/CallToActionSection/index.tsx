import { PlayCircleIcon } from "@heroicons/react/20/solid";
import { motion } from "motion/react";
import { ReactNode } from "react";
import PLANET from "../../assets/planet.svg";

interface CallToActionSectionProps {
  title: string | ReactNode;
  description: string;
  buttonText: string;
  buttonUrl?: string;
}

/**
 * CallToActionSection - Reusable CTA section with animated planet background
 * Features:
 * - Animated planet image with hover effects
 * - Flexible title (string or ReactNode for custom styling)
 * - Responsive layout
 * - Configurable button text and URL
 */
export const CallToActionSection = ({
  title,
  description,
  buttonText,
  buttonUrl = "https://forms.gle/dKh8ckXheRPdRa398"
}: CallToActionSectionProps) => {
  return (
    <section className="overflow-hidden bg-blue-900 px-4 py-32 text-white md:px-10">
      <div className="relative mx-auto flex flex-col justify-between sm:container md:flex-row">
        <motion.img
          alt="Planet decoration"
          aria-hidden="true"
          className="absolute left-0 w-full md:w-1/2"
          initial={{ opacity: 0, rotate: -30, x: -100, y: 100 }}
          src={PLANET}
          transition={{ duration: 0.8, ease: "easeOut" }}
          viewport={{ once: true }}
          whileHover={{ scale: 1.02 }}
          whileInView={{ opacity: 1, rotate: 0, x: 0, y: 0 }}
        />
        <div className="z-10 md:w-1/2">
          <h2 className="text-center font-bold text-h2 md:text-start md:font-normal">
            {typeof title === "string" ? title : title}
          </h2>
        </div>
        <div className="z-10 flex flex-col justify-center md:w-1/2 md:items-end">
          <p className="mt-3 mb-4 text-center text-body-lg md:mt-0 md:text-end">{description}</p>
          <a
            className="btn btn-vortex-secondary mx-auto flex items-center gap-2 rounded-3xl px-6 md:mx-0"
            href={buttonUrl}
            rel="noopener noreferrer"
            target="_blank"
          >
            <span>{buttonText}</span>
            <PlayCircleIcon aria-hidden="true" className="w-5 group-hover:text-pink-600" />
          </a>
        </div>
      </div>
    </section>
  );
};
