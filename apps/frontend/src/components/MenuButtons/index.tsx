import { HistoryMenuButton } from "../menus/HistoryMenu/HistoryMenuButton";
import { SettingsButton } from "../menus/SettingsMenu/SettingsButton";
import { StepBackButton } from "../StepBackButton";

export const MenuButtons = () => (
  <div className="flex w-full items-center justify-between gap-1">
    <StepBackButton />
    <div className="flex items-center justify-end gap-1">
      <HistoryMenuButton />
      <SettingsButton />
    </div>
  </div>
);
