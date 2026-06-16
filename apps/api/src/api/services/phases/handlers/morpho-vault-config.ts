import { Networks } from "@vortexfi/shared";

export interface MorphoVaultInfo {
  vaultAddress: `0x${string}`;
  depositAssetAddress: `0x${string}`;
  depositAssetDecimals: number;
  shareDecimals: number;
  network: Networks;
}

const MORPHO_VAULTS: Record<string, MorphoVaultInfo> = {
  "usdc-arbitrum": {
    depositAssetAddress: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831", // USDC on Arbitrum
    depositAssetDecimals: 6,
    network: Networks.Arbitrum,
    shareDecimals: 18, // MetaMorpho default
    vaultAddress: "0xbeeff1D5dE8F79ff37a151681100B039661da518" // Steakhouse on Arbitrum
  }
};

export function getMorphoVaultInfo(vaultId: string): MorphoVaultInfo {
  const vault = MORPHO_VAULTS[vaultId];
  if (!vault) {
    throw new Error(`Morpho vault "${vaultId}" not found. Available: ${Object.keys(MORPHO_VAULTS).join(", ")}`);
  }
  return vault;
}
