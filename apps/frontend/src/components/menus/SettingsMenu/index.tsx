import { ArrowRightOnRectangleIcon, UserCircleIcon } from "@heroicons/react/24/outline";
import { useSelector } from "@xstate/react";
import { useTranslation } from "react-i18next";
import { useRampActor } from "../../../contexts/rampState";
import { AuthService } from "../../../services/auth";
import { useSettingsMenuActions, useSettingsMenuState } from "../../../stores/settingsMenuStore";
import { LanguageSelector } from "../../LanguageSelector";
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
    <button
      className={`flex w-full cursor-pointer items-center gap-3 rounded-lg p-3 text-left transition-colors ${
        disabled ? "cursor-not-allowed text-gray-400" : "text-gray-700 hover:bg-gray-100"
      }`}
      disabled={disabled}
      onClick={disabled ? undefined : onClick}
      type="button"
    >
      {icon && <span className={disabled ? "text-gray-300" : "text-gray-500"}>{icon}</span>}
      <span className="font-medium text-sm">{label}</span>
      {disabled && <span className="ml-auto text-gray-400 text-xs">{t("Connect wallet")}</span>}
    </button>
  );
};

export const SettingsMenu = () => {
  const { t, i18n } = useTranslation();
  const isOpen = useSettingsMenuState();
  const { closeMenu } = useSettingsMenuActions();
  const rampActor = useRampActor();

  const { userEmail, isAuthenticated } = useSelector(rampActor, state => ({
    isAuthenticated: state.context.isAuthenticated,
    userEmail: state.context.userEmail
  }));

  const handleExternalLink = (url: string) => {
    window.open(url, "_blank", "noopener,noreferrer");
    closeMenu();
  };

  const handleSignOut = () => {
    AuthService.clearTokens();
    rampActor.send({ type: "LOGOUT" });

    closeMenu();
  };

  const menuItems = [
    {
      label: t("menus.settings.item.support"),
      onClick: () => handleExternalLink("https://forms.gle/3eqWZWzR8voMQwkY8")
    },
    {
      label: t("menus.settings.item.termsAndConditions"),
      onClick: () => handleExternalLink(`https://www.vortexfinance.co/${i18n.language}/terms-and-conditions`)
    },
    {
      label: t("menus.settings.item.imprint"),
      onClick: () => handleExternalLink("https://www.satoshipay.io/legal/imprint")
    }
  ];

  const renderContent = () => (
    <div className="space-y-2 pt-4">
      {isAuthenticated && userEmail && (
        <>
          <div className="mb-4 rounded-lg bg-gray-50 px-3 py-2">
            <div className="mb-3 flex items-center gap-2">
              <UserCircleIcon className="h-5 w-5 text-gray-600" />
              <span className="truncate font-medium text-gray-900 text-sm">{userEmail}</span>
            </div>
            <button
              className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-gray-300 bg-white px-4 py-2 font-medium text-gray-700 text-sm transition-all hover:bg-gray-50 active:scale-[0.98]"
              onClick={handleSignOut}
              type="button"
            >
              <ArrowRightOnRectangleIcon className="h-4 w-4" />
              {t("menus.settings.signOut")}
            </button>
          </div>
          <div className="mb-4 border-gray-200 border-t" />
        </>
      )}

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
    <Menu
      animationDirection={MenuAnimationDirection.RIGHT}
      isOpen={isOpen}
      onClose={closeMenu}
      title={t("menus.settings.title")}
    >
      {renderContent()}
    </Menu>
  );
};
