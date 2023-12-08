import { Storage } from './types';

const exists = (value?: string | null): value is string => !!value && value.length > 0;
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

  getNumber: (key: string) => Number(localStorage?.getItem(key)),
  getBoolean: (key: string) => Boolean(localStorage?.getItem(key)),

  set: (key, value?) =>
    localStorage?.setItem(
      key,
      (value && typeof value === 'object') || Array.isArray(value) ? JSON.stringify(value) : String(value),
    ),

  remove: (key) => localStorage?.removeItem(key),
};
