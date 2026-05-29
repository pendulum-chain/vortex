/**
 * Miscellaneous constants for token configuration
 */

import { AlfredpayOnChainCurrency } from "../../services/alfredpay/types";
import { EvmToken } from "../types/evm";

export const PENDULUM_WSS = "wss://rpc-pendulum.prd.pendulumchain.tech";
export const ASSETHUB_WSS = "wss://dot-rpc.stakeworld.io/assethub";
export const MOONBEAM_WSS = "wss://wss.api.moonbeam.network";
export const WALLETCONNECT_ASSETHUB_ID = "polkadot:68d56f15f85d3136970ec16946040bc1";
export const NABLA_ROUTER = "6gAVVw13mQgzzKk4yEwScMmWiCNyMAunXFJUZonbgKrym81N"; // AssetHub USDC instance

// Nabla on Base has two pool instances. Pools are addressed by their router+quoter pair.
// BRLA pool: handles BRLA<>USDC swaps (BRL on/off-ramp flows).
// EURC pool: handles EURC<>USDC swaps (Mykobo EUR on/off-ramp flows).
export const NABLA_ROUTER_BASE_BRLA: `0x${string}` = "0x8EF01C38e3261901e382A66bEbFa35E8B96c750C";
export const NABLA_QUOTER_BASE_BRLA: `0x${string}` = "0x2A7989993335b31A3133CDA93bc1a095e7b178Ff";
export const NABLA_ROUTER_BASE_EURC: `0x${string}` = "0x58E5Cb2dA15f01CB8FAefef202aa25238efCBdcf";
export const NABLA_QUOTER_BASE_EURC: `0x${string}` = "0x94C2F795358170a92271bF2490a56135E3fBA58A";

/**
 * Selects the Nabla pool (router + quoter) on Base for a given Base ERC20 token pair.
 * The token pair determines the pool unambiguously: any pair involving EURC uses the EURC pool;
 * any pair involving BRLA uses the BRLA pool. USDC appears in both pools.
 *
 * Throws if the pair is not supported by either pool (caller bug — token pair was not validated upstream).
 */
export function getNablaBasePool(
  inputTokenAddress: `0x${string}`,
  outputTokenAddress: `0x${string}`
): { router: `0x${string}`; quoter: `0x${string}` } {
  const lcInput = inputTokenAddress.toLowerCase();
  const lcOutput = outputTokenAddress.toLowerCase();
  const lcEurc = ERC20_EURC_BASE.toLowerCase();
  const lcBrla = ERC20_BRLA_BASE.toLowerCase();

  if (lcInput === lcEurc || lcOutput === lcEurc) {
    return { quoter: NABLA_QUOTER_BASE_EURC, router: NABLA_ROUTER_BASE_EURC };
  }
  if (lcInput === lcBrla || lcOutput === lcBrla) {
    return { quoter: NABLA_QUOTER_BASE_BRLA, router: NABLA_ROUTER_BASE_BRLA };
  }
  throw new Error(`getNablaBasePool: no Nabla pool on Base supports the pair ${inputTokenAddress} -> ${outputTokenAddress}`);
}

export const SPACEWALK_REDEEM_SAFETY_MARGIN = 0.05;
export const AMM_MINIMUM_OUTPUT_SOFT_MARGIN = 0.02;
export const AMM_MINIMUM_OUTPUT_HARD_MARGIN = 0.05;

export const TRANSFER_WAITING_TIME_SECONDS = 6000;
export const DEFAULT_LOGIN_EXPIRATION_TIME_HOURS = 7 * 24;

export const ERC20_USDC_POLYGON: `0x${string}` = "0x3c499c542cef5e3811e1192ce70d8cc03d5c3359"; // USDC on Polygon
export const ERC20_USDT_POLYGON: `0x${string}` = "0xc2132d05d31c914a87c6611c10748aeb04b58e8f"; // USDT on Polygon

export const ERC20_USDC_POLYGON_DECIMALS = 6; // USDC on Polygon has 6 decimals
export const ERC20_USDT_POLYGON_DECIMALS = 6; // USDT on Polygon has 6 decimals

export const ERC20_EURC_BASE: `0x${string}` = "0x60a3E35Cc302bFA44Cb288Bc5a4F316Fdb1adb42";
export const ERC20_EURC_BASE_TOKEN_NAME = "EURC";
export const ERC20_EURC_BASE_DECIMALS = 6;
export const ERC20_BRLA_BASE: `0x${string}` = "0xfCB34c47f850f452C15EA1B84d51231C38A61783";
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// ── AlfredPay on-chain token configuration ──────────────────────────────────
// Change these constants to switch the stablecoin used in all AlfredPay flows.
export const ALFREDPAY_ONCHAIN_CURRENCY = AlfredpayOnChainCurrency.USDT;
export const ALFREDPAY_ERC20_TOKEN: `0x${string}` = ERC20_USDT_POLYGON;
export const ALFREDPAY_ERC20_DECIMALS = ERC20_USDT_POLYGON_DECIMALS;
export const ALFREDPAY_EVM_TOKEN = EvmToken.USDT;

export const SQUDROUTER_MAIN_CONTRACT_POLYGON = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";
