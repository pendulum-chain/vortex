/**
 * EVM token configuration
 */

import { Networks } from "../../helpers";
import { PENDULUM_USDC_AXL } from "../constants/pendulum";
import { TokenType } from "../types/base";
import { EvmToken, EvmTokenDetails } from "../types/evm";

export const evmTokenConfig: Record<Networks, Record<EvmToken, EvmTokenDetails>> = {
  [Networks.Polygon]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Polygon
      erc20AddressSourceChain: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Polygon
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Polygon
      erc20AddressSourceChain: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Ethereum]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Ethereum
      erc20AddressSourceChain: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Ethereum
      erc20AddressSourceChain: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // Placeholder, update with actual address
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.BSC]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 18, // USDC on BSC
      erc20AddressSourceChain: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      network: Networks.BSC,
      networkAssetIcon: "bscUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 18, // USDT on BSC
      erc20AddressSourceChain: "0x55d398326f99059fF775485246999027B3197955",
      network: Networks.BSC,
      networkAssetIcon: "bscUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 18, // Placeholder, update with actual address
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.BSC,
      networkAssetIcon: "bscUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Arbitrum]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Arbitrum
      erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Arbitrum
      erc20AddressSourceChain: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // Placeholder, update with actual address
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Base]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Base
      erc20AddressSourceChain: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      network: Networks.Base,
      networkAssetIcon: "baseUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Base
      erc20AddressSourceChain: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      network: Networks.Base,
      networkAssetIcon: "baseUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // Placeholder, update with actual address
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Base,
      networkAssetIcon: "baseUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Avalanche]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Avalanche
      erc20AddressSourceChain: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Avalanche
      erc20AddressSourceChain: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // Placeholder, update with actual address
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.AssetHub]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // Placeholder, not applicable
      erc20AddressSourceChain: "0x0000000000000000000000000000000000000000",
      network: Networks.AssetHub,
      networkAssetIcon: "assethubUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // Placeholder, not applicable
      erc20AddressSourceChain: "0x0000000000000000000000000000000000000000",
      network: Networks.AssetHub,
      networkAssetIcon: "assethubUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // Placeholder, not applicable
      erc20AddressSourceChain: "0x0000000000000000000000000000000000000000",
      network: Networks.AssetHub,
      networkAssetIcon: "assethubUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Moonbeam]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Polygon
      erc20AddressSourceChain: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: Networks.Moonbeam,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Polygon
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Moonbeam,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Polygon
      erc20AddressSourceChain: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      network: Networks.Moonbeam,
      networkAssetIcon: "polygonUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  [Networks.Pendulum]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Polygon
      erc20AddressSourceChain: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Polygon
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Polygon
      erc20AddressSourceChain: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  },
  // Todo Stellar is a placeholder network, should not need this.
  [Networks.Stellar]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Polygon
      erc20AddressSourceChain: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Polygon
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDC",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Polygon
      erc20AddressSourceChain: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      network: Networks.Pendulum,
      networkAssetIcon: "polygonUSDT",
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL
    }
  }
};
