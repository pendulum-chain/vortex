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
  // In browser (Vite), check import.meta.env
  // @ts-ignore - import.meta.env may not be defined in non-Vite environments
  return (import.meta.env && (import.meta.env[key] || import.meta.env[`VITE_${key}`])) || fallback;
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

export const isSandboxEnabled = (): boolean => {
  return getEnvVar("SANDBOX_ENABLED") === "true" || getEnvVar("VITE_SANDBOX_ENABLED") === "true";
};
