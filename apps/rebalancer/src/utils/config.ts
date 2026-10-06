import { EvmClientManager, Networks } from "@vortexfi/shared";
import { mnemonicToAccount } from "viem/accounts";
import type { RebalancingCostPolicyConfig, RebalancingPolicyMode } from "../rebalance/usdc-brla-usdc-base/guards.ts";

const DEFAULT_REBALANCING_DAILY_BRIDGE_LIMIT_USD = 10_000;
const REBALANCING_POLICY_MODES: RebalancingPolicyMode[] = ["auto", "always", "dry-run", "off"];

function parseNonNegativeNumber(name: string, value: string | undefined, defaultValue: number): number {
  const trimmedValue = value?.trim();
  if (!trimmedValue) return defaultValue;

  const parsedValue = Number(trimmedValue.replaceAll("_", "").replaceAll(",", ""));
  if (!Number.isFinite(parsedValue) || parsedValue < 0) {
    throw new Error(`${name} must be a non-negative number.`);
  }

  return parsedValue;
}

export function parseRebalancingDailyBridgeLimitUsd(value = process.env.REBALANCING_DAILY_BRIDGE_LIMIT_USD) {
  return parseNonNegativeNumber("REBALANCING_DAILY_BRIDGE_LIMIT_USD", value, DEFAULT_REBALANCING_DAILY_BRIDGE_LIMIT_USD);
}

// Unset means no cap: USDC->BRLA->USDC runs ignore the Base Nabla USDC pool coverage.
export function parseRebalancingMaxUsdcCoverage(value = process.env.REBALANCING_MAX_USDC_COVERAGE): number | undefined {
  return value?.trim() ? parseNonNegativeNumber("REBALANCING_MAX_USDC_COVERAGE", value, 0) : undefined;
}

export function parseRebalancingPolicyMode(value = process.env.REBALANCING_POLICY_MODE): RebalancingPolicyMode {
  const mode = value?.trim() || "auto";
  if (!REBALANCING_POLICY_MODES.includes(mode as RebalancingPolicyMode)) {
    throw new Error(`REBALANCING_POLICY_MODE must be one of: ${REBALANCING_POLICY_MODES.join(", ")}.`);
  }

  return mode as RebalancingPolicyMode;
}

export function getRebalancingCostPolicyConfig(): RebalancingCostPolicyConfig {
  const config: RebalancingCostPolicyConfig = {
    hardMaxCostBps: parseNonNegativeNumber("REBALANCING_HARD_MAX_COST_BPS", process.env.REBALANCING_HARD_MAX_COST_BPS, 1_000),
    maxCostBpsMild: parseNonNegativeNumber("REBALANCING_MAX_COST_BPS_MILD", process.env.REBALANCING_MAX_COST_BPS_MILD, 25),
    maxCostBpsModerate: parseNonNegativeNumber(
      "REBALANCING_MAX_COST_BPS_MODERATE",
      process.env.REBALANCING_MAX_COST_BPS_MODERATE,
      75
    ),
    maxCostBpsSevere: parseNonNegativeNumber(
      "REBALANCING_MAX_COST_BPS_SEVERE",
      process.env.REBALANCING_MAX_COST_BPS_SEVERE,
      250
    ),
    mode: parseRebalancingPolicyMode(),
    moderateDeviationBps: parseNonNegativeNumber(
      "REBALANCING_MODERATE_DEVIATION_BPS",
      process.env.REBALANCING_MODERATE_DEVIATION_BPS,
      200
    ),
    opportunisticUsdcToBrlaMaxCostBps: parseNonNegativeNumber(
      "REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS",
      process.env.REBALANCING_OPPORTUNISTIC_USDC_TO_BRLA_MAX_COST_BPS,
      10
    ),
    severeDeviationBps: parseNonNegativeNumber(
      "REBALANCING_SEVERE_DEVIATION_BPS",
      process.env.REBALANCING_SEVERE_DEVIATION_BPS,
      500
    )
  };

  if (config.moderateDeviationBps > config.severeDeviationBps) {
    throw new Error("REBALANCING_MODERATE_DEVIATION_BPS must be less than or equal to REBALANCING_SEVERE_DEVIATION_BPS.");
  }

  if (config.maxCostBpsMild > config.maxCostBpsModerate || config.maxCostBpsModerate > config.maxCostBpsSevere) {
    throw new Error("Rebalancing max cost bps values must be ordered: mild <= moderate <= severe.");
  }

  if (config.maxCostBpsSevere > config.hardMaxCostBps) {
    throw new Error("REBALANCING_MAX_COST_BPS_SEVERE must be less than or equal to REBALANCING_HARD_MAX_COST_BPS.");
  }

  return config;
}

export function getConfig() {
  if (!process.env.EVM_ACCOUNT_SECRET) throw new Error("Missing EVM_ACCOUNT_SECRET environment variable");

  return {
    // BlindPay is used purely to log an observational comparison price (fiat BRL -> stablecoin)
    // against the executed routes. Optional: when apiKey/instanceId are missing, the comparison
    // is skipped and the rebalancer keeps working as before.
    blindpayApiKey: process.env.BLINDPAY_API_KEY,
    blindpayBaseUrl: process.env.BLINDPAY_BASE_URL || "https://api.blindpay.com/v1",
    blindpayInstanceId: process.env.BLINDPAY_INSTANCE_ID,
    // Sandbox/dev instances only support the "USDB" token; production uses "USDC"/"USDT".
    blindpayToken: process.env.BLINDPAY_TOKEN || "USDT",

    brlaBusinessAccountAddress: process.env.BRLA_BUSINESS_ACCOUNT_ADDRESS || "0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2",

    evmAccountSecret: process.env.EVM_ACCOUNT_SECRET,

    // Main Nabla instance on Base
    mainNablaQuoter: process.env.MAIN_NABLA_QUOTER as `0x${string}` | undefined,
    mainNablaRouter: process.env.MAIN_NABLA_ROUTER as `0x${string}` | undefined,

    /// The amount in BRLA to swap to USDC during each execution (BRLA→USDC reverse flow on Base).
    /// NOTE: The rebalancer now starts with USDC; this amount is now interpreted as a USD amount.
    rebalancingBrlToUsdAmount: process.env.REBALANCING_BRL_TO_USD_AMOUNT || "1",
    /// The minimum balance in USDC that the rebalancer account on Base must have to allow the BRLA pool rebalancing.
    rebalancingBrlToUsdMinBalance: process.env.REBALANCING_BRL_TO_USD_MIN_BALANCE || undefined,
    rebalancingCostPolicy: getRebalancingCostPolicyConfig(),
    rebalancingDailyBridgeLimitUsd: parseRebalancingDailyBridgeLimitUsd(),
    /// Maximum Base Nabla USDC pool coverage a USDC→BRLA→USDC run may leave behind (e.g. 1.3 = 130%).
    rebalancingMaxUsdcCoverage: parseRebalancingMaxUsdcCoverage(),
    /// The larger USDC amount to evaluate for USDC→BRLA→USDC runs and use when that larger amount is projected profitable.
    rebalancingProfitableUsdToBrlAmount:
      process.env.REBALANCING_PROFITABLE_USD_TO_BRL_AMOUNT || process.env.REBALANCING_USD_TO_BRL_AMOUNT || "1",

    /// The thresholds above and below the optimal coverage ratio at which the rebalancing will be triggered.
    /// Route-specific (fall back to REBALANCING_THRESHOLD, then 0.01).
    rebalancingThresholdBrlaToUsdc:
      Number(process.env.REBALANCING_THRESHOLD_BRLA_TO_USDC) || Number(process.env.REBALANCING_THRESHOLD) || 0.01,
    rebalancingThresholdUsdcToBrla:
      Number(process.env.REBALANCING_THRESHOLD_USDC_TO_BRLA) || Number(process.env.REBALANCING_THRESHOLD) || 0.01,
    /// The amount in USD to rebalance from the USD pool to the BRL pool on Pendulum during each execution.
    rebalancingUsdToBrlAmount: process.env.REBALANCING_USD_TO_BRL_AMOUNT || "1",
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    supabaseUrl: process.env.SUPABASE_URL
  };
}

export function getPolygonEvmClients() {
  const config = getConfig();

  const evmExecutorAccount = mnemonicToAccount(config.evmAccountSecret);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Polygon),
    walletClient: evmClientManager.getWalletClient(Networks.Polygon, evmExecutorAccount)
  };
}

export function getBaseEvmClients() {
  const config = getConfig();

  const evmExecutorAccount = mnemonicToAccount(config.evmAccountSecret);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Base),
    walletClient: evmClientManager.getWalletClient(Networks.Base, evmExecutorAccount)
  };
}
