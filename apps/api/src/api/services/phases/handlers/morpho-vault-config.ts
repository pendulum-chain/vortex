import { Networks } from "@vortexfi/shared";

export interface MorphoVaultInfo {
  vaultAddress: `0x${string}`;
  depositAssetAddress: `0x${string}`;
  depositAssetDecimals: number;
  shareDecimals: number;
  network: Networks;
}

const MORPHO_VAULTS: Record<string, MorphoVaultInfo> = {
  "usdc-base": {
    depositAssetAddress: "0x833589fcd6edb6e08f4c7c32d4f71b54bda02913", // USDC on Base
    depositAssetDecimals: 6,
    network: Networks.Base,
    shareDecimals: 18, // MetaMorpho default
    vaultAddress: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9" // Steakhouse Prime Instant on Base
  }
};

export function getMorphoVaultInfo(vaultId: string): MorphoVaultInfo {
  const vault = MORPHO_VAULTS[vaultId];
  if (!vault) {
    throw new Error(`Morpho vault "${vaultId}" not found. Available: ${Object.keys(MORPHO_VAULTS).join(", ")}`);
  }
  return vault;
}
