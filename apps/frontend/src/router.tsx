import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import "./i18n";
import { routeTree } from "./routeTree.gen";

// Called once per request on the server and once on the client, so the QueryClient is
// created per router instance rather than shared across renders.
export function getRouter() {
  const queryClient = new QueryClient();

  return createRouter({
    context: { queryClient },
    routeTree
  });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
