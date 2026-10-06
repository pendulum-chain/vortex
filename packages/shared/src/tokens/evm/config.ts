/**
 * EVM token configuration
 */

import { EvmNetworks, Networks } from "../../helpers";
import { EvmAddress } from "../../types";
import { ERC20_EURC_BASE, ERC20_EURC_BASE_DECIMALS } from "../constants/misc";
import { PENDULUM_USDC_AXL } from "../pendulum/config";
import { TokenType } from "../types/base";
import { EvmToken, EvmTokenDetails } from "../types/evm";

// All EVM tokens are represented by axlUSDC on Pendulum.
const evmToken = (
  network: Networks,
  assetSymbol: string,
  decimals: number,
  erc20AddressSourceChain: EvmAddress,
  isNative = false
): EvmTokenDetails => ({
  assetSymbol,
  decimals,
  erc20AddressSourceChain,
  isNative,
  network,
  pendulumRepresentative: PENDULUM_USDC_AXL,
  type: TokenType.Evm
});

export const evmTokenConfig: Record<EvmNetworks, Partial<Record<EvmToken, EvmTokenDetails>>> = {
  [Networks.Ethereum]: {
    [EvmToken.USDC]: evmToken(Networks.Ethereum, "USDC", 6, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48"),
    [EvmToken.USDT]: evmToken(Networks.Ethereum, "USDT", 6, "0xdAC17F958D2ee523a2206206994597C13D831ec7"),
    [EvmToken.ETH]: evmToken(Networks.Ethereum, "ETH", 18, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true),
    [EvmToken.AXLUSDC]: evmToken(Networks.Ethereum, "USDC.axl", 6, "0x1B81D678ffb9C0263b24A97847620C99d213eB14")
  },
  [Networks.Polygon]: {
    [EvmToken.USDC]: evmToken(Networks.Polygon, "USDC", 6, "0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359"),
    [EvmToken.USDCE]: evmToken(Networks.Polygon, "USDC.e", 6, "0x2791bca1f2de4661ed88a30c99a7a9449aa84174"),
    [EvmToken.USDT]: evmToken(Networks.Polygon, "USDT", 6, "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"),
    [EvmToken.AXLUSDC]: evmToken(Networks.Polygon, "USDC.axl", 6, "0x750e4c4984a9e0f12978ea6742bc1c5d248f40ed"),
    [EvmToken.POL]: evmToken(Networks.Polygon, "POL", 18, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true)
  },
  [Networks.PolygonAmoy]: {
    [EvmToken.USDC]: evmToken(Networks.PolygonAmoy, "USDC", 6, "0x41e94eb019c0762f9bfcf9fb1e58725bfb0e7582")
  },
  [Networks.BSC]: {
    [EvmToken.USDC]: evmToken(Networks.BSC, "USDC", 18, "0x8AC76a51cc950d9822D68b83fE1Ad97B32Cd580d"),
    [EvmToken.USDT]: evmToken(Networks.BSC, "USDT", 18, "0x55d398326f99059fF775485246999027B3197955"),
    [EvmToken.ETH]: evmToken(Networks.BSC, "ETH", 18, "0x2170ed0880ac9a755fd29b2688956bd959f933f8"),
    [EvmToken.AXLUSDC]: evmToken(Networks.BSC, "USDC.axl", 6, "0x4268B8F0B87b6Eae5d897996E6b845ddbD99Adf3")
  },
  [Networks.Arbitrum]: {
    [EvmToken.USDC]: evmToken(Networks.Arbitrum, "USDC", 6, "0xaf88d065e77c8cC2239327C5EDb3A432268e5831"),
    [EvmToken.USDCE]: evmToken(Networks.Arbitrum, "USDC.e", 6, "0xFF970A61A04b1cA14834A43f5dE4533eBDDB5CC8"),
    [EvmToken.USDT]: evmToken(Networks.Arbitrum, "USDT", 6, "0xFd086bC7CD5C481DCC9C85ebE478A1C0b69FCbb9"),
    [EvmToken.ETH]: evmToken(Networks.Arbitrum, "ETH", 18, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true),
    [EvmToken.AXLUSDC]: evmToken(Networks.Arbitrum, "USDC.axl", 6, "0xEB466342C4d449BC9f53A865D5Cb90586f405215")
  },
  [Networks.Base]: {
    [EvmToken.USDC]: evmToken(Networks.Base, "USDC", 6, "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913"),
    [EvmToken.USDT]: evmToken(Networks.Base, "USDT", 6, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"),
    [EvmToken.ETH]: evmToken(Networks.Base, "ETH", 18, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true),
    [EvmToken.AXLUSDC]: evmToken(Networks.Base, "USDC.axl", 6, "0xEB466342C4d449BC9f53A865D5Cb90586f405215"),
    [EvmToken.BRLA]: evmToken(Networks.Base, "BRLA", 18, "0xfCB34c47f850f452C15EA1B84d51231C38A61783"),
    [EvmToken.EURC]: evmToken(Networks.Base, "EURC", ERC20_EURC_BASE_DECIMALS, ERC20_EURC_BASE)
  },
  [Networks.BaseSepolia]: {
    [EvmToken.USDC]: evmToken(Networks.BaseSepolia, "USDC", 6, "0x1b888723fb7699f9dF0a99443107E8A888A67e11"), // Mock USDC contract
    [EvmToken.USDT]: evmToken(Networks.BaseSepolia, "USDT", 6, "0xfde4C96c8593536E31F229EA8f37b2ADa2699bb2"),
    [EvmToken.ETH]: evmToken(Networks.BaseSepolia, "ETH", 18, "0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee", true),
    [EvmToken.AXLUSDC]: evmToken(Networks.BaseSepolia, "USDC.axl", 6, "0xEB466342C4d449BC9f53A865D5Cb90586f405215"),
    [EvmToken.BRLA]: evmToken(Networks.BaseSepolia, "BRLA", 18, "0x57180796D4082Ba903d86c4eA3C86490fA10512c") // Mock BRLA contract
  },
  [Networks.Avalanche]: {
    [EvmToken.USDC]: evmToken(Networks.Avalanche, "USDC", 6, "0xB97EF9Ef8734C71904D8002F8b6Bc66Dd9c48a6E"),
    [EvmToken.USDT]: evmToken(Networks.Avalanche, "USDT", 6, "0x9702230A8Ea53601f5cD2dc00fDBc13d4dF4A8c7"),
    [EvmToken.USDCE]: evmToken(Networks.Avalanche, "USDC.e", 6, "0xA7D7079b0FEaD91F3e65f86E8915Cb59c1a4C664"),
    [EvmToken.AXLUSDC]: evmToken(Networks.Avalanche, "USDC.axl", 6, "0xfaB550568C688d5D8A52C7d794cb93Edc26eC0eC")
  },
  [Networks.Moonbeam]: {
    [EvmToken.AXLUSDC]: evmToken(Networks.Moonbeam, "USDC.axl", 6, "0xca01a1d0993565291051daff390892518acfad3a"),
    [EvmToken.USDC]: evmToken(Networks.Moonbeam, "USDC", 6, "0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48")
  }
};
