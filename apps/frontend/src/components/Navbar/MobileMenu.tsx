import { Link, useParams } from "@tanstack/react-router";
import { motion } from "motion/react";
import { useTranslation } from "react-i18next";

interface MobileMenuProps {
  onMenuItemClick: () => void;
}

export const MobileMenu = ({ onMenuItemClick }: MobileMenuProps) => {
  const { t } = useTranslation();
  const params = useParams({ strict: false });

  return (
    <motion.div
      animate={{ y: 0 }}
      className="absolute top-[66px] right-0 left-0 z-40 overflow-hidden bg-blue-950 shadow-lg sm:hidden"
      exit={{ y: "-100%" }}
      initial={{ y: "-100%" }}
      transition={{ damping: 30, stiffness: 300, type: "spring" }}
    >
      <div className="group flex flex-col px-6 py-4">
        <Link
          activeProps={{
            className: "text-white group-hover:[&:not(:hover)]:text-gray-400"
          }}
          className="block w-full px-2 py-2 text-left text-gray-400 text-xl transition-colors hover:text-white hover:opacity-90"
          onClick={onMenuItemClick}
          params={params}
          to="/{-$locale}"
        >
          {t("components.navbar.individuals")}
        </Link>

        <Link
          activeProps={{
            className: "text-white group-hover:[&:not(:hover)]:text-gray-400"
          }}
          className="block w-full px-2 py-2 text-left text-gray-400 text-xl transition-colors hover:text-white"
          onClick={onMenuItemClick}
          params={params}
          to="/{-$locale}/business"
        >
          {t("components.navbar.business")}
        </Link>

        <div className="mt-6 mb-4">
          <Link className="btn btn-vortex-secondary w-full rounded-md" to="/{-$locale}/widget">
            Buy & Sell
          </Link>
        </div>
      </div>
    </motion.div>
  );
};
