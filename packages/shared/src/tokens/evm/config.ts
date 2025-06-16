/**
 * EVM token configuration
 */

import { EvmTerminalNetworks, Networks } from '../../helpers';
import { PENDULUM_USDC_AXL } from '../constants/pendulum';
import { TokenType } from '../types/base';
import { EvmToken, EvmTokenDetails } from '../types/evm';

export const evmTokenConfig: Record<EvmTerminalNetworks, Partial<Record<EvmToken, EvmTokenDetails>>> = {
  [Networks.Ethereum]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48', // USDC on Ethereum
      networkAssetIcon: 'ethereumUSDC',
      decimals: 6,
      network: Networks.Ethereum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xdAC17F958D2ee523a2206206994597C13D831ec7', // USDT on Ethereum
      networkAssetIcon: 'ethereumUSDT',
      decimals: 6,
      network: Networks.Ethereum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.ETH]: {
      assetSymbol: 'ETH',
      erc20AddressSourceChain: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // ETH on Ethereum
      networkAssetIcon: 'ethereumETH',
      decimals: 18,
      network: Networks.Ethereum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  [Networks.Polygon]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359', // USDC on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDCE]: {
      assetSymbol: 'USDC.e',
      erc20AddressSourceChain: '0x2791bca1f2de4661ed88a30c99a7a9449aa84174', // USDC.e on Polygon
      networkAssetIcon: 'polygonUSDC',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xc2132d05d31c914a87c6611c10748aeb04b58e8f', // USDT on Polygon
      networkAssetIcon: 'polygonUSDT',
      decimals: 6,
      network: Networks.Polygon,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  [Networks.BSC]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d', // USDC on BSC
      networkAssetIcon: 'bscUSDC',
      decimals: 18,
      network: Networks.BSC,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x55d398326f99059fF775485246999027B3197955', // USDT on BSC
      networkAssetIcon: 'bscUSDT',
      decimals: 18,
      network: Networks.BSC,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.ETH]: {
      assetSymbol: 'ETH',
      erc20AddressSourceChain: '0x2170ed0880ac9a755fd29b2688956bd959f933f8', // ETH on BSC
      networkAssetIcon: 'bscETH',
      decimals: 18,
      network: Networks.BSC,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  [Networks.Arbitrum]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xaf88d065e77c8cC2239327C5EDb3A432268e5831', // USDC on Arbitrum
      networkAssetIcon: 'arbitrumUSDC',
      decimals: 6,
      network: Networks.Arbitrum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9', // USDT on Arbitrum
      networkAssetIcon: 'arbitrumUSDT',
      decimals: 6,
      network: Networks.Arbitrum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.ETH]: {
      assetSymbol: 'ETH',
      erc20AddressSourceChain: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // ETH on Arbitrum
      networkAssetIcon: 'arbitrumETH',
      decimals: 18,
      network: Networks.Arbitrum,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  [Networks.Base]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913', // USDC on Base
      networkAssetIcon: 'baseUSDC',
      decimals: 6,
      network: Networks.Base,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2', // USDT on Base
      networkAssetIcon: 'baseUSDT',
      decimals: 6,
      network: Networks.Base,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.ETH]: {
      assetSymbol: 'ETH',
      erc20AddressSourceChain: '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', // ETH on Base
      networkAssetIcon: 'baseETH',
      decimals: 18,
      network: Networks.Base,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
  [Networks.Avalanche]: {
    [EvmToken.USDC]: {
      assetSymbol: 'USDC',
      erc20AddressSourceChain: '0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E', // USDC on Avalanche
      networkAssetIcon: 'avalancheUSDC',
      decimals: 6,
      network: Networks.Avalanche,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
    [EvmToken.USDT]: {
      assetSymbol: 'USDT',
      erc20AddressSourceChain: '0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7', // USDT on Avalanche
      networkAssetIcon: 'avalancheUSDT',
      decimals: 6,
      network: Networks.Avalanche,
      type: TokenType.Evm,
      ...PENDULUM_USDC_AXL,
    },
  },
};
