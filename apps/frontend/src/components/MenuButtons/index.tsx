import { RampHistoryButton } from "../RampHistory/RampHistoryButton";
import { SettingsButton } from "../SettingsButton";

export const MenuButtons = () => (
  <div className="flex items-center justify-end gap-1">
    <RampHistoryButton />
    <SettingsButton />
  </div>
);
