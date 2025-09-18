import { useMemo } from "react";

export const useWidgetMode = (): boolean => {
  const isWidgetMode = useMemo(() => window.location.pathname.includes("/widget"), []);

  return isWidgetMode;
};
