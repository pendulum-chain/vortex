import { createRootRoute, Outlet } from "@tanstack/react-router";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootComponent
});

function RootComponent() {
  return (
    <>
      <Outlet />
      <Toaster closeButton position="top-right" richColors />
    </>
  );
}
