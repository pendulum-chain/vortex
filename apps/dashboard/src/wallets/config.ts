export interface CdpWalletConfig {
  enabled: boolean;
  offrampEnabled: boolean;
  onrampEnabled: boolean;
  projectId: string;
  provisioningEnabled: boolean;
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function readCdpWalletConfig(env: ImportMetaEnv = import.meta.env): CdpWalletConfig {
  const projectId = env.VITE_CDP_PROJECT_ID?.trim() ?? "";
  const isEnabled = enabled(env.VITE_CDP_ENABLED) && projectId.length > 0;

  return {
    enabled: isEnabled,
    offrampEnabled: isEnabled && enabled(env.VITE_CDP_OFFRAMP_ENABLED),
    onrampEnabled: isEnabled && enabled(env.VITE_CDP_ONRAMP_ENABLED),
    projectId,
    provisioningEnabled: isEnabled && enabled(env.VITE_CDP_PROVISIONING_ENABLED)
  };
}

export const cdpWalletConfig = readCdpWalletConfig();
