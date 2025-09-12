import { HistoryMenuButton } from "../menus/HistoryMenu/HistoryMenuButton";
import { SettingsButton } from "../menus/SettingsMenu/SettingsButton";

export const MenuButtons = () => (
  <div className="flex items-center justify-end gap-1">
    <HistoryMenuButton />
    <SettingsButton />
  </div>
);
