import Big from 'big.js';

const exists = (value?: string | null): value is string => !!value && value.length > 0;

export interface Storage {
  get: (key: string, defaultValue?: string) => string | undefined;
  getParsed: <T = string>(key: string, defaultValue?: T, parses?: (text: string) => T | undefined) => T | undefined;
  getNumber: (key: string) => number | undefined;
  getBig: (key: string) => Big | undefined;
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: unknown) => void;
  remove: (key: string) => void;
}

export const storageService: Storage = {
  get: (key, defaultValue?) => {
    if (!localStorage) return defaultValue;
    const value = localStorage.getItem(key);
    return exists(value) ? value : defaultValue;
  },
  getParsed: (key, defaultValue?, parser = JSON.parse) => {
    if (!localStorage) return defaultValue;
    const value = localStorage.getItem(key);
    if (!exists(value)) return defaultValue;
    try {
      return parser(value as string);
    } catch (e) {
      return defaultValue;
    }
  },

  getBig: (key: string) => {
    try {
      new Big(localStorage?.getItem(key)!);
    } catch {
      return undefined;
    }
  },
  getNumber: (key: string) => Number(localStorage?.getItem(key)),
  getBoolean: (key: string) => Boolean(localStorage?.getItem(key)),

  set: (key, value?) =>
    localStorage?.setItem(
      key,
      (value && typeof value === 'object') || Array.isArray(value) ? JSON.stringify(value) : String(value),
    ),

  remove: (key) => localStorage?.removeItem(key),
};
