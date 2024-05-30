import { useEffect, useMemo, useState } from 'preact/compat';
import { debounce } from '../helpers/function';

export const useDebouncedValue = <T>(value: T, delay = 1000) => {
  const [debouncedValue, setDebouncedValue] = useState(value);
  const debounceSet = useMemo(() => debounce(setDebouncedValue, delay), [delay]);

  useEffect(() => {
    debounceSet(value);
  }, [value, debounceSet]);

  return debouncedValue;
};
