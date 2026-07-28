import { createRootRoute, Outlet } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";
import { useTokenRefresh } from "@/hooks/useTokenRefresh";

export const Route = createRootRoute({
  component: RootComponent
});

function RootComponent() {
  useTokenRefresh();

  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <Toaster closeButton position="top-right" richColors />
    </MotionConfig>
  );
}
