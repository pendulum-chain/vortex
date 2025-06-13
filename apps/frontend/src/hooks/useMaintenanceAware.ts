import { useIsMaintenanceActive } from '../stores/maintenanceStore';

/**
 * Hook to make components maintenance-aware
 * Returns whether actions should be disabled due to maintenance
 */
export const useMaintenanceAware = () => {
  const isMaintenanceActive = useIsMaintenanceActive();

  return {
    isMaintenanceActive,
    shouldDisableActions: isMaintenanceActive,
    getDisabledProps: (isDisabled = false) => ({
      disabled: isDisabled || isMaintenanceActive,
      title: isMaintenanceActive ? 'Action unavailable due to scheduled maintenance' : undefined,
    }),
  };
};

/**
 * Hook specifically for form submission buttons and confirm actions
 */
export const useMaintenanceAwareButton = (originalDisabled = false) => {
  const { shouldDisableActions, getDisabledProps } = useMaintenanceAware();

  return {
    isDisabled: originalDisabled || shouldDisableActions,
    buttonProps: getDisabledProps(originalDisabled),
    isMaintenanceDisabled: shouldDisableActions,
  };
};
