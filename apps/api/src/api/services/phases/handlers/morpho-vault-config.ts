import { Networks } from "@vortexfi/shared";

export interface MorphoVaultInfo {
  vaultAddress: `0x${string}`;
  depositAssetAddress: `0x${string}`;
  depositAssetDecimals: number;
  shareDecimals: number;
  network: Networks;
}

const MORPHO_VAULTS: Record<string, MorphoVaultInfo> = {
  "usdc-ethereum": {
    depositAssetAddress: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48", // USDC on Ethereum
    depositAssetDecimals: 6,
    network: Networks.Ethereum,
    shareDecimals: 18, // MetaMorpho default
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
