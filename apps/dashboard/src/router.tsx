import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";
import { setManagedProfileAccessDeniedHandler } from "./services/api/api-client";
import { AuthService } from "./services/auth";
import { clearManagedProfileSelection } from "./stores/managed-profile.store";

export function getRouter() {
  const router = createTanStackRouter({
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
    routeTree,
    scrollRestoration: true
  });
  setManagedProfileAccessDeniedHandler(async selectionSnapshot => {
    if (!AuthService.isManagedProfileSelectionSnapshotCurrent(selectionSnapshot)) return false;
    await router.navigate({ replace: true, to: "/managed-profiles" });
    clearManagedProfileSelection(selectionSnapshot);
    return true;
  });
  return router;
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
