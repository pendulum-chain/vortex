import { useTranslation } from "react-i18next";
import { useIsMaintenanceActive } from "../stores/maintenanceStore";

/**
 * Hook to make components maintenance-aware
 * Returns whether actions should be disabled due to maintenance
 */
export const useMaintenanceAware = () => {
  const { t } = useTranslation();
  const isMaintenanceActive = useIsMaintenanceActive();

  return {
    getDisabledProps: (isDisabled = false) => ({
      disabled: isDisabled || isMaintenanceActive,
      title: isMaintenanceActive ? t("components.maintenance.button") : undefined
    }),
    isMaintenanceActive,
    shouldDisableActions: isMaintenanceActive
  };
};

/**
 * Hook specifically for form submission buttons and confirm actions
 */
export const useMaintenanceAwareButton = (originalDisabled = false) => {
  const { shouldDisableActions, getDisabledProps } = useMaintenanceAware();

  return {
    buttonProps: getDisabledProps(originalDisabled),
    isDisabled: originalDisabled || shouldDisableActions,
    isMaintenanceDisabled: shouldDisableActions
  };
};
