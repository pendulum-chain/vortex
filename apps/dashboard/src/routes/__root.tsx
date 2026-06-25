import { createRootRoute, Outlet } from "@tanstack/react-router";
import { MotionConfig } from "motion/react";
import { Toaster } from "@/components/ui/sonner";

export const Route = createRootRoute({
  component: RootComponent
});

function RootComponent() {
  return (
    <MotionConfig reducedMotion="user">
      <Outlet />
      <Toaster closeButton position="top-right" richColors />
    </MotionConfig>
  );
}
