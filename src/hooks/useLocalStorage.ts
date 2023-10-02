import { DateTime } from 'luxon';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/compat';
import { debounce } from '../helpers/function';
import { storageService } from '../services/storage/local';
import { Storage } from '../services/storage/types';

export type UseLocalStorageProps<T> = {
  /** Storage key */
  key: string;
  /** Should the value be parsed (eg.: in case of objects) */
  parse?: boolean;
  /** Should the value updating be debounced (eg.: for quickly changing values) */
  debounce?: number;
  /** Expire time in seconds, or undefined for no expiry. */
  expire?: number;
} & (T extends undefined
  ? {
      /** Default/fallback value */
      defaultValue?: T;
    }
  : {
      /** Default/fallback value */
      defaultValue: T;
    });

export interface UseLocalStorageResponse<T> {
  /** Storage state/value */
  state: T;
  /** Set storage value */
  set: (data: T) => void;
  /** Merge storage value with existing (eg.: updating part of an object) */
  merge: (data: Partial<T> | ((data: T) => T)) => void;
  /** Clear storage value */
  clear: () => void;
}

const hasExpired = (date: DateTime, expire?: number) => {
  if (expire === undefined) return false;
  return DateTime.now() < date.plus({ seconds: expire });
};

const getState = <T>(key: string, defaultValue: T, parse: boolean, expire?: number): T => {
  const date = expire !== undefined ? storageService.get(`${key}_`) : undefined;
  if (date?.length && hasExpired(DateTime.fromMillis(Number(date)), expire)) return defaultValue;
  if (!parse) return (storageService.get(key) as T) ?? defaultValue;
  const parsed = storageService.getParsed<T>(key, defaultValue) as T;
  return defaultValue !== undefined
    ? ({
        ...defaultValue,
        ...parsed,
      } as T)
    : parsed;
};

export const useLocalStorage = <T>({
  key,
  defaultValue,
  debounce: debounceTime,
  parse,
  expire,
}: UseLocalStorageProps<T>): UseLocalStorageResponse<T> => {
  type TResponse = UseLocalStorageResponse<T>;
  const firstRef = useRef(false);
  const storageSet = useMemo<Storage['set']>(() => {
    const internalSet = (key: string, value: unknown) => {
      storageService.set(key, value);
      if (expire !== undefined) storageService.set(`${key}_`, DateTime.now());
    };
    return debounceTime ? debounce(internalSet, debounceTime) : internalSet;
  }, [debounceTime, expire]);

  const [state, setState] = useState<T>(() => getState<T>(key, defaultValue as T, !!parse, expire));

  const set = useCallback<TResponse['set']>(
    (value) => {
      storageSet(key, value);
      setState(value);
    },
    [key, storageSet],
  );
  const clear = useCallback<TResponse['clear']>(() => {
    storageService.remove(key);
    storageService.remove(`${key}_`);
    setState(defaultValue as T);
  }, [defaultValue, key]);
  const merge = useCallback<TResponse['merge']>(
    (value) => {
      setState((prev) => {
        const newVal = typeof value === 'function' ? value(prev) : ({ ...prev, ...value } as T);
        storageSet(key, newVal);
        return newVal;
      });
    },
    [key, storageSet],
  );

  useEffect(() => {
    if (firstRef.current) {
      setState(getState<T>(key, defaultValue as T, !!parse, expire));
    }
    firstRef.current = true;
  }, [defaultValue, key, expire, parse]);

  return { state, set, merge, clear };
};
