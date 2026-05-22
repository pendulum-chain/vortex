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
export const NABLA_ROUTER_BASE: `0x${string}` = "0x58E5Cb2dA15f01CB8FAefef202aa25238efCBdcf";
export const NABLA_QUOTER_BASE: `0x${string}` = "0x94C2F795358170a92271bF2490a56135E3fBA58A";

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
export const BASE_CHAIN_ID = 8453;
export const BASE_SEPOLIA_CHAIN_ID = 84532;

// ── AlfredPay on-chain token configuration ──────────────────────────────────
// Change these constants to switch the stablecoin used in all AlfredPay flows.
export const ALFREDPAY_ONCHAIN_CURRENCY = AlfredpayOnChainCurrency.USDT;
export const ALFREDPAY_ERC20_TOKEN: `0x${string}` = ERC20_USDT_POLYGON;
export const ALFREDPAY_ERC20_DECIMALS = ERC20_USDT_POLYGON_DECIMALS;
export const ALFREDPAY_EVM_TOKEN = EvmToken.USDT;

export const SQUDROUTER_MAIN_CONTRACT_POLYGON = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";
