import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface HamburgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const HamburgerButton = ({ isOpen, onClick }: HamburgerButtonProps) => {
  const { t } = useTranslation();

  return (
    <motion.button
      aria-expanded={isOpen}
      aria-label={t("components.navbar.toggleMobileMenu")}
      className="group flex h-10 w-10 cursor-pointer flex-col items-center justify-center gap-[5px] rounded-md bg-pink-600 transition-colors duration-200 hover:bg-pink-500"
      onClick={onClick}
      whileTap={{ scale: 0.95 }}
    >
      <motion.span
        animate={isOpen ? { rotate: 45, y: 7 } : { rotate: 0, y: 0 }}
        className="block h-0.5 w-5 origin-center rounded-full bg-white"
      />
      <motion.span
        animate={isOpen ? { opacity: 0, scaleX: 0 } : { opacity: 1, scaleX: 1 }}
        className="block h-0.5 w-5 origin-center rounded-full bg-white"
      />
      <motion.span
        animate={isOpen ? { rotate: -45, y: -7 } : { rotate: 0, y: 0 }}
        className="block h-0.5 w-5 origin-center rounded-full bg-white"
      />
    </motion.button>
  );
};
