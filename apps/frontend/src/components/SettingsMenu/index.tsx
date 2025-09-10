import { motion } from "motion/react";
import { useTranslation } from "react-i18next";
import { useSettingsMenuActions, useSettingsMenuState } from "../../stores/settingsMenuStore";
import { LanguageSelector } from "../LanguageSelector";
import { Menu, MenuAnimationDirection } from "../Menu";

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

export const SettingsMenu = () => {
  const { t } = useTranslation();
  const isOpen = useSettingsMenuState();
  const { closeMenu } = useSettingsMenuActions();

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

  const renderContent = () => (
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
  );

  return (
    <Menu animationDirection={MenuAnimationDirection.TOP} isOpen={isOpen} onClose={closeMenu} title="Settings">
      {renderContent()}
    </Menu>
  );
};
