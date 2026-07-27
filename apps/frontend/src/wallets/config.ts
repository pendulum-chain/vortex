export type PrivyGasPolicy = "sponsored" | "user_pays";

export interface PrivyWidgetConfig {
  allowedParentOrigins: string[];
  appId: string;
  clientId?: string;
  enabled: boolean;
  gasPolicy: PrivyGasPolicy;
  provisioningEnabled: boolean;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

export function readPrivyWidgetConfig(env: ImportMetaEnv = import.meta.env): PrivyWidgetConfig {
  const appId = env.VITE_PRIVY_APP_ID?.trim() ?? "";
  const rawParentOrigins: string = env.VITE_PRIVY_WIDGET_PARENT_ORIGINS ?? "";
  const allowedParentOrigins = rawParentOrigins
    .split(",")
    .map(normalizeOrigin)
    .filter((origin: string | undefined): origin is string => Boolean(origin));

  const isEnabled = env.VITE_PRIVY_ENABLED?.trim().toLowerCase() === "true" && appId.length > 0;
  return {
    allowedParentOrigins: [...new Set(allowedParentOrigins)],
    appId,
    clientId: env.VITE_PRIVY_CLIENT_ID?.trim() || undefined,
    enabled: isEnabled,
    gasPolicy: env.VITE_PRIVY_GAS_POLICY === "sponsored" ? "sponsored" : "user_pays",
    provisioningEnabled: isEnabled && env.VITE_PRIVY_PROVISIONING_ENABLED?.trim().toLowerCase() === "true"
  };
}

export function isPrivyOriginAllowed(
  config: Pick<PrivyWidgetConfig, "allowedParentOrigins">,
  frame: { isTopLevel: boolean; referrer: string }
): boolean {
  if (frame.isTopLevel) return true;
  if (!frame.referrer) return false;
  try {
    return config.allowedParentOrigins.includes(new URL(frame.referrer).origin);
  } catch {
    return false;
  }
}

function browserFrame(): { isTopLevel: boolean; referrer: string } {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return { isTopLevel: true, referrer: "" };
  }
  let isTopLevel = false;
  try {
    isTopLevel = window.self === window.top;
  } catch {
    isTopLevel = false;
  }
  return { isTopLevel, referrer: document.referrer };
}

export const privyWidgetConfig = readPrivyWidgetConfig();
export const isPrivyEnabledForCurrentFrame =
  privyWidgetConfig.enabled && isPrivyOriginAllowed(privyWidgetConfig, browserFrame());
export const isPrivyProvisioningEnabledForCurrentFrame =
  privyWidgetConfig.provisioningEnabled && isPrivyOriginAllowed(privyWidgetConfig, browserFrame());
