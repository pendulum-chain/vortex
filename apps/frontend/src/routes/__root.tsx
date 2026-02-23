import { createRootRoute, Outlet } from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { ToastPopover } from "../components/ToastPopover";
import { EventsProvider } from "../contexts/events";
import { NetworkProvider } from "../contexts/network";

const RootComponent = () => (
  <NetworkProvider>
    <EventsProvider>
      <Outlet />
      <ToastPopover />
      <div id="modals">
        {/* This is where the dialogs/modals are rendered. It is placed here because it is the highest point in the app where the tailwind data-theme is available */}
      </div>
      <TanStackRouterDevtools />
    </EventsProvider>
  </NetworkProvider>
);

export const Route = createRootRoute({ component: RootComponent });
