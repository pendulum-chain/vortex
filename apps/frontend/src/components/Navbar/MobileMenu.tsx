import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { cn } from "../../helpers/cn";
import { SubmenuItem } from "./types";

interface MobileMenuProps {
  isOpen: boolean;
  submenuItems: SubmenuItem[];
  onBookDemoClick: () => void;
  onDocsClick: () => void;
  onMenuItemClick: () => void;
}

const mobileMenuItemStyles = "block w-full text-left px-2 py-2 text-white text-xl hover:bg-blue-800 transition-colors";

export const MobileMenu = ({ isOpen, submenuItems, onBookDemoClick, onDocsClick, onMenuItemClick }: MobileMenuProps) => {
  const { t } = useTranslation();

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          animate={{ height: "auto", opacity: 1 }}
          className="fixed top-[64px] right-0 left-0 z-40 overflow-hidden bg-blue-950 shadow-lg sm:hidden"
          exit={{ height: 0, opacity: 0 }}
          initial={{ height: 0, opacity: 0 }}
          key="mobile-menu"
          transition={{
            duration: 0.4,
            ease: "easeInOut"
          }}
        >
          <motion.div
            animate={{ y: 0 }}
            className="flex flex-col px-6 py-4"
            exit={{ y: -20 }}
            initial={{ y: -20 }}
            transition={{
              duration: 0.2,
              ease: "easeOut"
            }}
          >
            <div className="mb-6">
              <div className={mobileMenuItemStyles}>{t("components.navbar.solutions")}</div>
              <div className="space-y-2">
                {submenuItems.map((item, index) => (
                  <motion.button
                    animate={{ opacity: 1, x: 0 }}
                    className={cn(mobileMenuItemStyles, "ml-4")}
                    exit={{ opacity: 0, x: -20 }}
                    initial={{ opacity: 0, x: -20 }}
                    key={item.label}
                    onClick={() => {
                      item.onClick();
                      onMenuItemClick();
                    }}
                    transition={{
                      delay: 0.1 + index * 0.1,
                      duration: 0.2,
                      ease: "easeOut"
                    }}
                  >
                    {item.label}
                  </motion.button>
                ))}
              </div>
            </div>

            <motion.button
              animate={{ opacity: 1, x: 0 }}
              className={mobileMenuItemStyles}
              exit={{ opacity: 0, x: -20 }}
              initial={{ opacity: 0, x: -20 }}
              onClick={() => {
                onDocsClick();
                onMenuItemClick();
              }}
              transition={{
                delay: 0.3,
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              {t("components.navbar.docs")}
            </motion.button>

            <motion.div
              animate={{ opacity: 1, y: 0 }}
              className="mt-6 mb-4"
              exit={{ opacity: 0, y: 20 }}
              initial={{ opacity: 0, y: 20 }}
              transition={{
                delay: 0.4,
                duration: 0.2,
                ease: "easeOut"
              }}
            >
              <button className="btn btn-vortex-secondary w-full rounded-3xl" onClick={onBookDemoClick}>
                {t("components.navbar.bookDemo")}
              </button>
            </motion.div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
};
