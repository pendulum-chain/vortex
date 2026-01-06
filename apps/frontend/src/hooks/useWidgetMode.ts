import { useMatchRoute } from "@tanstack/react-router";

export const useWidgetMode = (): boolean => {
  const matchRoute = useMatchRoute();
  const isWidgetMode = !!matchRoute({ to: "/{-$locale}/widget" });

  return isWidgetMode;
};
