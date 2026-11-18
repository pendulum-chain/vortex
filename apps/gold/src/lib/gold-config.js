import { base, mainnet } from "viem/chains";

export const GOLD_ASSETS = Object.freeze({
  ethereum: Object.freeze({ network: "ethereum", chain: mainnet, address: "0x45804880De22913dAFE09f4980848ECE6EcbAf78", decimals: 18 }),
  // Paxos' 2026-11-06 Base launch; contract also listed by Coinbase's PAXG network registry.
  base: Object.freeze({ network: "base", chain: base, address: "0xe904AEA5E1b110c9174728fA2efFc8aeD19E98Ef", decimals: 18 }),
});
export const BASE_USDC = Object.freeze({ address: "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913", decimals: 6 });

export function readGoldConfig(env = {}) {
  const network = env.VITE_GOLD_NETWORK || "ethereum";
  if (!GOLD_ASSETS[network]) throw new Error("VITE_GOLD_NETWORK must be ethereum or base.");
  const baseEnabled = network === "base" && env.VITE_GOLD_BASE_ENABLED === "true";
  return Object.freeze({ network, asset: GOLD_ASSETS[network], baseEnabled, usdcEnabled: baseEnabled && env.VITE_GOLD_USDC_ENABLED === "true" });
}
export const GOLD_CONFIG = readGoldConfig(import.meta.env || {});
// Pre-migration records have no network. Never reinterpret an open Ethereum order as Base.
export const rampNetwork = (record) => record?.network || "ethereum";
