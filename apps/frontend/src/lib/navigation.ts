import { useRouter } from "@tanstack/react-router";

type RouterInstance = ReturnType<typeof useRouter>;

/**
 * Clean URL parameters by navigating to the current path without search params
 * This replaces the pattern of using window.history.replaceState + window.location.reload
 */
export const cleanUrlParams = (router: RouterInstance, params: Record<string, string>) => {
  router.navigate({
    params,
    replace: true,
    search: {},
    to: router.latestLocation.pathname
  });
};

/**
 * Navigate to a clean URL origin (removing all path and params)
 * Used when resetting the application state
 */
export const navigateToCleanOrigin = (router: RouterInstance, params: Record<string, string>) => {
  router.navigate({
    params,
    replace: true,
    search: {},
    to: "/{-$locale}"
  });
};
