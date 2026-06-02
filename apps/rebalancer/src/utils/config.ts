import { Keyring } from "@polkadot/api";
import { BRLA_BASE_URL, EvmClientManager, Networks } from "@vortexfi/shared";
import { mnemonicToAccount } from "viem/accounts";

export function getConfig() {
  if (!process.env.EVM_ACCOUNT_SECRET) throw new Error("Missing EVM_ACCOUNT_SECRET environment variable");

  return {
    alchemyApiKey: process.env.ALCHEMY_API_KEY,
    brlaBaseUrl: BRLA_BASE_URL,

    brlaBusinessAccountAddress: process.env.BRLA_BUSINESS_ACCOUNT_ADDRESS || "0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2",

    evmAccountSecret: process.env.EVM_ACCOUNT_SECRET,

    indexerFreshnessThresholdMinutes: process.env.INDEXER_FRESHNESS_THRESHOLD_MINUTES
      ? Number(process.env.INDEXER_FRESHNESS_THRESHOLD_MINUTES)
      : 5,

    pendulumAccountSecret: process.env.PENDULUM_ACCOUNT_SECRET,
    rebalancingDailyBridgeLimitUsd: Number(process.env.REBALANCING_DAILY_BRIDGE_LIMIT_USD) || 10_000,

    /// The threshold above and below the optimal coverage ratio at which the rebalancing will be triggered.
    rebalancingThreshold: Number(process.env.REBALANCING_THRESHOLD) || 0.25,
    /// The amount in USD to rebalance from the USD pool to the BRL pool on Pendulum during each execution.
    rebalancingUsdToBrlAmount: process.env.REBALANCING_USD_TO_BRL_AMOUNT || "1",
    /// The minimum balance in USD that the rebalancer account on Pendulum must have to allow rebalancing to occur.
    rebalancingUsdToBrlMinBalance: process.env.REBALANCING_USD_TO_BRL_MIN_BALANCE || undefined,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_KEY,
    supabaseUrl: process.env.SUPABASE_URL
  };
}

export function getPendulumAccount() {
  const config = getConfig();
  if (!config.pendulumAccountSecret) throw new Error("Missing PENDULUM_ACCOUNT_SECRET environment variable");

  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(config.pendulumAccountSecret);
}

export function getMoonbeamEvmClients() {
  const config = getConfig();

  const evmExecutorAccount = mnemonicToAccount(config.evmAccountSecret as `0x${string}`);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Moonbeam),
    walletClient: evmClientManager.getWalletClient(Networks.Moonbeam, evmExecutorAccount)
  };
}

export function getPolygonEvmClients() {
  const config = getConfig();

  const evmExecutorAccount = mnemonicToAccount(config.evmAccountSecret as `0x${string}`);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Polygon),
    walletClient: evmClientManager.getWalletClient(Networks.Polygon, evmExecutorAccount)
  };
}

export function getBaseEvmClients() {
  const config = getConfig();

  const evmExecutorAccount = mnemonicToAccount(config.evmAccountSecret as `0x${string}`);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Base),
    walletClient: evmClientManager.getWalletClient(Networks.Base, evmExecutorAccount)
  };
}
