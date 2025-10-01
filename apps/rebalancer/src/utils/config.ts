import { createEvmClientsAndConfig } from "@packages/shared";
import { Keyring } from "@polkadot/api";
import { mnemonicToAccount } from "viem/accounts";
import { moonbeam, polygon } from "viem/chains";

export function getConfig() {
  if (!process.env.PENDULUM_ACCOUNT_SECRET) throw new Error("Missing PENDULUM_ACCOUNT_SECRET environment variable");
  if (!process.env.MOONBEAM_ACCOUNT_SECRET) throw new Error("Missing MOONBEAM_ACCOUNT_SECRET environment variable");
  if (!process.env.POLYGON_ACCOUNT_SECRET) throw new Error("Missing POLYGON_ACCOUNT_SECRET environment variable");

  return {
    alchemyApiKey: process.env.ALCHEMY_API_KEY,
    brlaBaseUrl: process.env.BRLA_BASE_URL || "https://api.avenia.io:8443",

    brlaBusinessAccountAddress: process.env.BRLA_BUSINESS_ACCOUNT_ADDRESS || "0x50E9c023314019f63d2001F2edA92acF1d8ABe2a",

    moonbeamAccountSecret: process.env.MOONBEAM_ACCOUNT_SECRET,
    pendulumAccountSecret: process.env.PENDULUM_ACCOUNT_SECRET,
    polygonAccountSecret: process.env.POLYGON_ACCOUNT_SECRET, // Default to 0.25 if not set
    /// The threshold above and below the optimal coverage ratio at which the rebalancing will be triggered.
    rebalancingThreshold: Number(process.env.REBALANCING_THRESHOLD) || 0.25
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
  return createEvmClientsAndConfig(moonbeamExecutorAccount, moonbeam);
}

export function getPolygonEvmClients() {
  const config = getConfig();

  const polygonExecutorAccount = mnemonicToAccount(config.polygonAccountSecret as `0x${string}`);
  return createEvmClientsAndConfig(polygonExecutorAccount, polygon);
}
