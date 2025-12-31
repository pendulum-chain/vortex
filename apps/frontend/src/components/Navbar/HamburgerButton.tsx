import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface HamburgerButtonProps {
  isOpen: boolean;
  onClick: () => void;
}

export const HamburgerButton = ({ isOpen, onClick }: HamburgerButtonProps) => {
  const { t } = useTranslation();

  return (
    <button
      aria-label={t("components.navbar.toggleMobileMenu")}
      className="group flex h-10 w-10 cursor-pointer flex-col items-center justify-center rounded-md border-pink-600 bg-pink-600 transition-all duration-200 hover:border hover:bg-pink-50"
      onClick={onClick}
    >
      <motion.span
        animate={isOpen ? { rotate: 45, y: 6 } : { rotate: 0, y: 0 }}
        className="block h-0.5 w-5 bg-pink-50 group-hover:bg-pink-600"
        transition={{ damping: 30, stiffness: 300, type: "spring" }}
      />
      <motion.span
        animate={isOpen ? { opacity: 0 } : { opacity: 1 }}
        className="mt-1 block h-0.5 w-5 bg-pink-50 group-hover:bg-pink-600"
        transition={{ damping: 30, stiffness: 300, type: "spring" }}
      />
      <motion.span
        animate={isOpen ? { rotate: -45, y: -6 } : { rotate: 0, y: 0 }}
        className="mt-1 block h-0.5 w-5 bg-pink-50 group-hover:bg-pink-600"
        transition={{ damping: 30, stiffness: 300, type: "spring" }}
      />
    </button>
  );
};
