import { AnimatePresence, motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useEscapeKey } from "../../hooks/useEscapeKey";
import { useHamburgerMenuActions, useHamburgerMenuState } from "../../stores/hamburgerMenuStore";

import { LanguageSelector } from "../LanguageSelector";

interface MenuItemProps {
  label: string;
  onClick: () => void;
  icon?: React.ReactNode;
  disabled?: boolean;
}

const MenuItem = ({ label, onClick, icon, disabled }: MenuItemProps) => {
  const { t } = useTranslation();

  return (
    <motion.button
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        disabled ? "cursor-not-allowed text-gray-400" : "text-gray-700 hover:bg-gray-100"
      }`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      whileHover={disabled ? {} : { scale: 1.02 }}
      whileTap={disabled ? {} : { scale: 0.98 }}
    >
      {icon && <span className={disabled ? "text-gray-300" : "text-gray-500"}>{icon}</span>}
      <span className="font-medium text-sm">{label}</span>
      {disabled && <span className="ml-auto text-gray-400 text-xs">{t("Connect wallet")}</span>}
    </motion.button>
  );
};

export const HamburgerMenu = () => {
  const { t } = useTranslation();
  const isOpen = useHamburgerMenuState();
  const { closeMenu } = useHamburgerMenuActions();

  useEscapeKey(isOpen, closeMenu);

  const handleExternalLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    closeMenu();
  };

  const menuItems = [
    {
      label: t("Support"),
      onClick: () => handleExternalLink("https://forms.gle/3eqWZWzR8voMQwkY8")
    },
    {
      label: t("Terms and Conditions"),
      onClick: () => handleExternalLink("https://www.vortexfinance.co/terms-conditions")
    },
    {
      label: t("Imprint"),
      onClick: () => handleExternalLink("https://www.satoshipay.io/legal/imprint")
    }
  ];

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.section
          animate={{ y: 0 }}
          className="absolute top-0 right-0 bottom-0 left-0 z-40 flex w-full flex-col overflow-hidden rounded-lg bg-white px-4 pt-4 pb-2 shadow-lg"
          exit={{ y: "-100%" }}
          initial={{ y: "-100%" }}
          transition={{ duration: 0.5 }}
        >
          <div className="no-scrollbar flex-1 overflow-y-auto">
            <h1 className="mb-4 font-bold text-gray-700 text-xl">Menu</h1>
            <hr />
            <div className="space-y-2 pt-4">
              <div className="space-y-1">
                {menuItems.map((item, index) => (
                  <MenuItem key={index} label={item.label} onClick={item.onClick} />
                ))}
              </div>

              <div className="mt-6 border-gray-200 border-t pt-4">
                <div className="flex justify-center">
                  <LanguageSelector />
                </div>
              </div>
            </div>
          </div>
        </motion.section>
      )}
    </AnimatePresence>
  );
};
