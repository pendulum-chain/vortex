import { HistoryMenuButton } from "../HistoryMenu/HistoryMenuButton";
import { SettingsButton } from "../SettingsMenu/SettingsButton";

export const MenuButtons = () => (
  <div className="flex items-center justify-end gap-1">
    <HistoryMenuButton />
    <SettingsButton />
  </div>
);
