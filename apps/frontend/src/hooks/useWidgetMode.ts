import { useMemo } from "react";

export const useWidgetMode = (): boolean => {
  const isWidgetMode = useMemo(() => {
    const params = new URLSearchParams(window.location.search);
    // We are in widget mode if the "mode" parameter is set to "widget"
    // or if a quote id was passed in the URL
    return params.get("mode")?.toLowerCase() === "widget" || params.get("quoteId") !== null;
  }, []);

  return isWidgetMode;
};
