import { Storage } from "./types";

const exists = (value?: string | null): value is string => !!value && value.length > 0;

// During SSR/prerender `localStorage` is an undeclared global, so `!localStorage` and
// `localStorage?.x` both throw a ReferenceError — it has to be probed with `typeof`.
const browserStorage: globalThis.Storage | undefined = typeof localStorage === "undefined" ? undefined : localStorage;

export const storageService: Storage = {
  get: (key, defaultValue?) => {
    const value = browserStorage?.getItem(key);
    return exists(value) ? value : defaultValue;
  },
  getBoolean: (key: string) => Boolean(browserStorage?.getItem(key)),

  getNumber: (key: string) => Number(browserStorage?.getItem(key)),
  getParsed: (key, defaultValue?, parser = JSON.parse) => {
    const value = browserStorage?.getItem(key);
    if (!exists(value)) return defaultValue;
    try {
      return parser(value);
    } catch (_e) {
      return defaultValue;
    }
  },

  remove: key => browserStorage?.removeItem(key),

  set: (key, value?) =>
    browserStorage?.setItem(
      key,
      (value && typeof value === "object") || Array.isArray(value) ? JSON.stringify(value) : String(value)
    )
};
