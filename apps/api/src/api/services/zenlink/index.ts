interface ZenlinkId {
  chainId: number;
  assetType: number;
  assetIndex: number;
}

// The mapping of asset symbols to their Zenlink IDs
const assetToZenlinkIdMap: { [key: string]: ZenlinkId } = {
  PEN: {
    assetIndex: 0,
    assetType: 0,
    chainId: 2094
  },
  // Assethub USDC
  USDC: {
    assetIndex: 258,
    assetType: 2,
    chainId: 2094
  },
  // Axelar USDC
  "USDC.axl": {
    assetIndex: 268,
    assetType: 2,
    chainId: 2094
  }
};

export function getZenlinkIdForAsset(asset: string): ZenlinkId | null {
  return assetToZenlinkIdMap[asset] || null;
}
