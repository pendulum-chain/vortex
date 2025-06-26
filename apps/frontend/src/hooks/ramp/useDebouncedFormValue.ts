import { useEffect, useRef } from "react";
import { debounce } from "../../helpers/function";

/**
 * Hook to debounce form value updates to a store
 * @param value The current form value
 * @param setValue The setter function for the store
 * @param delay The debounce delay in milliseconds
 */
export const useDebouncedFormValue = <T>(value: T, setValue: (value: T) => void, delay = 1000) => {
  const debouncedSetValue = useRef(debounce(setValue, delay));

  useEffect(() => {
    debouncedSetValue.current(value);
  }, [value]);
};
