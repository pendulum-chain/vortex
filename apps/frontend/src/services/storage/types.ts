export interface Storage {
  get: (key: string, defaultValue?: string) => string | undefined;
  getParsed: <T = string>(key: string, defaultValue?: T, parses?: (text: string) => T | undefined) => T | undefined;
  getNumber: (key: string) => number | undefined;
  getBoolean: (key: string) => boolean | undefined;
  set: (key: string, value: unknown) => void;
  remove: (key: string) => void;
}
