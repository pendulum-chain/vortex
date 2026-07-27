export type PrivyGasPolicy = "sponsored" | "user_pays";

export interface PrivyWalletConfig {
  appId: string;
  clientId?: string;
  enabled: boolean;
  gasPolicy: PrivyGasPolicy;
  offrampEnabled: boolean;
  onrampEnabled: boolean;
  provisioningEnabled: boolean;
}

function enabled(value: string | undefined): boolean {
  return value?.trim().toLowerCase() === "true";
}

export function readPrivyWalletConfig(env: ImportMetaEnv = import.meta.env): PrivyWalletConfig {
  const appId = env.VITE_PRIVY_APP_ID?.trim() ?? "";
  const clientId = env.VITE_PRIVY_CLIENT_ID?.trim() || undefined;
  const gasPolicy = env.VITE_PRIVY_GAS_POLICY === "sponsored" ? "sponsored" : "user_pays";
  const isEnabled = enabled(env.VITE_PRIVY_ENABLED) && appId.length > 0;

  return {
    appId,
    clientId,
    enabled: isEnabled,
    gasPolicy,
    offrampEnabled: isEnabled && enabled(env.VITE_PRIVY_OFFRAMP_ENABLED),
    onrampEnabled: isEnabled && enabled(env.VITE_PRIVY_ONRAMP_ENABLED),
    provisioningEnabled: isEnabled && enabled(env.VITE_PRIVY_PROVISIONING_ENABLED)
  };
}

export const privyWalletConfig = readPrivyWalletConfig();
