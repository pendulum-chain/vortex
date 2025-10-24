import { BRLA_BASE_URL, EvmClientManager, Networks } from "@packages/shared";
import { Keyring } from "@polkadot/api";
import { mnemonicToAccount } from "viem/accounts";

export function getConfig() {
  if (!process.env.PENDULUM_ACCOUNT_SECRET) throw new Error("Missing PENDULUM_ACCOUNT_SECRET environment variable");
  if (!process.env.MOONBEAM_ACCOUNT_SECRET) throw new Error("Missing MOONBEAM_ACCOUNT_SECRET environment variable");
  if (!process.env.POLYGON_ACCOUNT_SECRET) throw new Error("Missing POLYGON_ACCOUNT_SECRET environment variable");

  return {
    alchemyApiKey: process.env.ALCHEMY_API_KEY,
    brlaBaseUrl: BRLA_BASE_URL,

    brlaBusinessAccountAddress: process.env.BRLA_BUSINESS_ACCOUNT_ADDRESS || "0xDF5Fb34B90e5FDF612372dA0c774A516bF5F08b2",

    moonbeamAccountSecret: process.env.MOONBEAM_ACCOUNT_SECRET,
    pendulumAccountSecret: process.env.PENDULUM_ACCOUNT_SECRET,
    polygonAccountSecret: process.env.POLYGON_ACCOUNT_SECRET,
    /// The threshold above and below the optimal coverage ratio at which the rebalancing will be triggered.
    rebalancingThreshold: Number(process.env.REBALANCING_THRESHOLD) || 0.25 // Default to 0.25 if not set
  };
}

export function getPendulumAccount() {
  const config = getConfig();

  const keyring = new Keyring({ type: "sr25519" });
  return keyring.addFromUri(config.pendulumAccountSecret);
}

export function getMoonbeamEvmClients() {
  const config = getConfig();

  const moonbeamExecutorAccount = mnemonicToAccount(config.moonbeamAccountSecret as `0x${string}`);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Moonbeam),
    walletClient: evmClientManager.getWalletClient(Networks.Moonbeam, moonbeamExecutorAccount)
  };
}

export function getPolygonEvmClients() {
  const config = getConfig();

  const polygonExecutorAccount = mnemonicToAccount(config.polygonAccountSecret as `0x${string}`);
  const evmClientManager = EvmClientManager.getInstance();
  return {
    publicClient: evmClientManager.getClient(Networks.Polygon),
    walletClient: evmClientManager.getWalletClient(Networks.Polygon, polygonExecutorAccount)
  };
}
