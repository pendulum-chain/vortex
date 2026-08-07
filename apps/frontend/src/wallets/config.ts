export interface CdpWidgetConfig {
  allowedParentOrigins: string[];
  enabled: boolean;
  exportEnabled: boolean;
  projectId: string;
  provisioningEnabled: boolean;
  signingEnabled: boolean;
}

function normalizeOrigin(value: string): string | undefined {
  try {
    return new URL(value.trim()).origin;
  } catch {
    return undefined;
  }
}

export function readCdpWidgetConfig(env: ImportMetaEnv = import.meta.env): CdpWidgetConfig {
  const projectId = env.VITE_CDP_PROJECT_ID?.trim() ?? "";
  const rawParentOrigins: string = env.VITE_CDP_WIDGET_PARENT_ORIGINS ?? "";
  const allowedParentOrigins = rawParentOrigins
    .split(",")
    .map(normalizeOrigin)
    .filter((origin: string | undefined): origin is string => Boolean(origin));

  const isEnabled = env.VITE_CDP_ENABLED?.trim().toLowerCase() === "true" && projectId.length > 0;
  return {
    allowedParentOrigins: [...new Set(allowedParentOrigins)],
    enabled: isEnabled,
    exportEnabled: isEnabled && env.VITE_CDP_EXPORT_ENABLED?.trim().toLowerCase() === "true",
    projectId,
    provisioningEnabled: isEnabled && env.VITE_CDP_PROVISIONING_ENABLED?.trim().toLowerCase() === "true",
    signingEnabled: isEnabled && env.VITE_CDP_SIGNING_ENABLED?.trim().toLowerCase() === "true"
  };
}

export function isCdpOriginAllowed(
  config: Pick<CdpWidgetConfig, "allowedParentOrigins">,
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

export const cdpWidgetConfig = readCdpWidgetConfig();
export const isCdpEnabledForCurrentFrame = cdpWidgetConfig.enabled && isCdpOriginAllowed(cdpWidgetConfig, browserFrame());
export const isCdpProvisioningEnabledForCurrentFrame =
  cdpWidgetConfig.provisioningEnabled && isCdpOriginAllowed(cdpWidgetConfig, browserFrame());
