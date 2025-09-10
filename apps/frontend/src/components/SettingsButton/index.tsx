import { Cog6ToothIcon } from "@heroicons/react/24/outline";
import { useSettingsMenuActions, useSettingsMenuState } from "../../stores/settingsMenuStore";
import { SettingsMenu } from "../SettingsMenu";

export const SettingsButton = () => {
  const isOpen = useSettingsMenuState();
  const { toggleMenu } = useSettingsMenuActions();

  return (
    <>
      <button
        aria-label={isOpen ? "Close menu" : "Open menu"}
        className={"btn-vortex-accent cursor-pointer rounded-full p-2 px-3.5 py-1.5"}
        onClick={toggleMenu}
      >
        <Cog6ToothIcon className="h-5 w-5" />
      </button>
      <SettingsMenu />
    </>
  );
};
