import { useEffect } from "react";

/**
 * Hook that listens for the Escape key press and calls the provided callback
 * @param isActive Whether the listener should be active
 * @param onEscape Callback function to execute when Escape key is pressed
 */
export function useEscapeKey(isActive: boolean, onEscape: () => void) {
  useEffect(() => {
    if (!isActive) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onEscape();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isActive, onEscape]);
}
