/**
 * EVM token configuration
 */

import { EvmNetworks, Networks } from "../../helpers";
import { PENDULUM_USDC_AXL } from "../constants/pendulum";
import { TokenType } from "../types/base";
import { EvmToken, EvmTokenDetails } from "../types/evm";

export const evmTokenConfig: Record<EvmNetworks, Partial<Record<EvmToken, EvmTokenDetails>>> = {
  [Networks.Ethereum]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Ethereum
      erc20AddressSourceChain: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      isNative: false,
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Ethereum
      erc20AddressSourceChain: "0xdAC17F958D2ee523a2206206994597C13D831ec7",
      isNative: false,
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.ETH]: {
      assetSymbol: "ETH",
      decimals: 18, // ETH on Ethereum
      erc20AddressSourceChain: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      isNative: true,
      network: Networks.Ethereum,
      networkAssetIcon: "ethereumETH",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.Polygon]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Polygon
      erc20AddressSourceChain: "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      isNative: false,
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Polygon
      erc20AddressSourceChain: "0x2791bca1f2de4661ed88a30c99a7a9449aa84174",
      isNative: false,
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Polygon
      erc20AddressSourceChain: "0xc2132d05d31c914a87c6611c10748aeb04b58e8f",
      isNative: false,
      network: Networks.Polygon,
      networkAssetIcon: "polygonUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.PolygonAmoy]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // Testnet USDC on Polygon Amoy
      erc20AddressSourceChain: "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582",
      isNative: false,
      network: Networks.PolygonAmoy,
      networkAssetIcon: "polygonUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.BSC]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 18, // USDC on BSC
      erc20AddressSourceChain: "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d",
      isNative: false,
      network: Networks.BSC,
      networkAssetIcon: "bscUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 18, // USDT on BSC
      erc20AddressSourceChain: "0x55d398326f99059fF775485246999027B3197955",
      isNative: false,
      network: Networks.BSC,
      networkAssetIcon: "bscUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.ETH]: {
      assetSymbol: "ETH",
      decimals: 18, // ETH on BSC
      erc20AddressSourceChain: "0x2170ed0880ac9a755fd29b2688956bd959f933f8",
      isNative: false,
      network: Networks.BSC,
      networkAssetIcon: "bscETH",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.Arbitrum]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Arbitrum
      erc20AddressSourceChain: "0xaf88d065e77c8cC2239327C5EDb3A432268e5831",
      isNative: false,
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Arbitrum
      erc20AddressSourceChain: "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8",
      isNative: false,
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Arbitrum
      erc20AddressSourceChain: "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9",
      isNative: false,
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.ETH]: {
      assetSymbol: "ETH",
      decimals: 18, // ETH on Arbitrum
      erc20AddressSourceChain: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      isNative: true,
      network: Networks.Arbitrum,
      networkAssetIcon: "arbitrumETH",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.Base]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Base
      erc20AddressSourceChain: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",
      isNative: false,
      network: Networks.Base,
      networkAssetIcon: "baseUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Base
      erc20AddressSourceChain: "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2",
      isNative: false,
      network: Networks.Base,
      networkAssetIcon: "baseUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.ETH]: {
      assetSymbol: "ETH",
      decimals: 18, // ETH on Base
      erc20AddressSourceChain: "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      isNative: true,
      network: Networks.Base,
      networkAssetIcon: "baseETH",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.Avalanche]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Avalanche
      erc20AddressSourceChain: "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E",
      isNative: false,
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDT]: {
      assetSymbol: "USDT",
      decimals: 6, // USDT on Avalanche
      erc20AddressSourceChain: "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7",
      isNative: false,
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDT",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    },
    [EvmToken.USDCE]: {
      assetSymbol: "USDC.e",
      decimals: 6, // USDC.e on Avalanche
      erc20AddressSourceChain: "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664",
      isNative: false,
      network: Networks.Avalanche,
      networkAssetIcon: "avalancheUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  },
  [Networks.Moonbeam]: {
    [EvmToken.USDC]: {
      assetSymbol: "USDC",
      decimals: 6, // USDC on Moonbeam
      erc20AddressSourceChain: "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48",
      isNative: false,
      network: Networks.Moonbeam,
      networkAssetIcon: "moonbeamUSDC",
      pendulumRepresentative: PENDULUM_USDC_AXL,
      type: TokenType.Evm
    }
  }
};
