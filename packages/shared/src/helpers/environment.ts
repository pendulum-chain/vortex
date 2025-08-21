export const isServer = (): boolean => {
  return typeof window === "undefined";
};

export const isBrowser = (): boolean => {
  return !isServer();
};

export const getEnvVar = (key: string, fallback = ""): string => {
  if (isServer()) {
    return process.env[key] || fallback;
  }
  return fallback;
};

export const isProduction = (): boolean => {
  return getEnvVar("NODE_ENV") === "production";
};

export const isDevelopment = (): boolean => {
  return getEnvVar("NODE_ENV") === "development";
};

export const isTest = (): boolean => {
  return getEnvVar("NODE_ENV") === "test";
};
