import { Networks } from "@vortexfi/shared";

export interface MorphoVaultInfo {
  vaultAddress: `0x${string}`;
  depositAssetAddress: `0x${string}`;
  depositAssetDecimals: number;
  network: Networks;
}

const MORPHO_VAULTS: Record<string, MorphoVaultInfo> = {
  "usdc-base": {
    depositAssetAddress: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
    depositAssetDecimals: 6,
    network: Networks.Base,
    vaultAddress: "0xbeef0e0834849aCC03f0089F01f4F1Eeb06873C9"
  }
};

export function getMorphoVaultInfo(vaultId: string): MorphoVaultInfo {
  const vault = MORPHO_VAULTS[vaultId];
  if (!vault) {
    throw new Error(`Morpho vault "${vaultId}" not found. Available: ${Object.keys(MORPHO_VAULTS).join(", ")}`);
  }
  return vault;
}
