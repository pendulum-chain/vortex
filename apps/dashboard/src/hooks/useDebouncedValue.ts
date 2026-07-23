import { useEffect, useState } from "react";

/** Trails `value` by `delayMs` so a typed amount doesn't fire a quote request per keystroke. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);

  // External sync: the timer is the external system being coordinated with.
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
