import { Link, useParams } from "@tanstack/react-router";
import { motion, type Variants } from "motion/react";
import { useTranslation } from "react-i18next";

interface MobileMenuProps {
  onMenuItemClick: () => void;
}

const menuVariants: Variants = {
  closed: {
    opacity: 0,
    transition: {
      duration: 0.2,
      ease: [0.4, 0, 1, 1],
      staggerChildren: 0.05,
      staggerDirection: -1,
      when: "afterChildren"
    },
    y: -20
  },
  open: {
    opacity: 1,
    transition: {
      duration: 0.3,
      ease: [0, 0, 0.2, 1],
      staggerChildren: 0.07,
      when: "beforeChildren"
    },
    y: 0
  }
};

const menuItemVariants: Variants = {
  closed: {
    opacity: 0,
    transition: { duration: 0.15, ease: "easeIn" },
    x: -16
  },
  open: {
    opacity: 1,
    transition: { duration: 0.25, ease: "easeOut" },
    x: 0
  }
};

const buttonVariants: Variants = {
  closed: {
    opacity: 0,
    scale: 0.95,
    transition: { duration: 0.15 }
  },
  open: {
    opacity: 1,
    scale: 1,
    transition: { damping: 20, stiffness: 300, type: "spring" }
  }
};

export const MobileMenu = ({ onMenuItemClick }: MobileMenuProps) => {
  const { t } = useTranslation();
  const params = useParams({ strict: false });

  return (
    <motion.div
      animate="open"
      className="absolute top-full right-0 left-0 z-50 bg-blue-950 shadow-lg"
      exit="closed"
      initial="closed"
      variants={menuVariants}
    >
      <nav className="group flex flex-col px-6 py-4">
        <motion.div variants={menuItemVariants}>
          <Link
            activeProps={{
              className: "text-white group-hover:[&:not(:hover)]:text-gray-400"
            }}
            className="block w-full px-2 py-3 text-left text-gray-400 text-xl transition-colors hover:text-white"
            onClick={onMenuItemClick}
            params={params}
            to="/{-$locale}"
          >
            {t("components.navbar.individuals")}
          </Link>
        </motion.div>

        <motion.div variants={menuItemVariants}>
          <Link
            activeProps={{
              className: "text-white group-hover:[&:not(:hover)]:text-gray-400"
            }}
            className="block w-full px-2 py-3 text-left text-gray-400 text-xl transition-colors hover:text-white"
            onClick={onMenuItemClick}
            params={params}
            to="/{-$locale}/business"
          >
            {t("components.navbar.business")}
          </Link>
        </motion.div>

        <motion.div className="mt-6 mb-4" variants={buttonVariants}>
          <Link className="btn btn-vortex-secondary w-full rounded-md" onClick={onMenuItemClick} to="/{-$locale}/widget">
            Buy & Sell
          </Link>
        </motion.div>
      </nav>
    </motion.div>
  );
};
