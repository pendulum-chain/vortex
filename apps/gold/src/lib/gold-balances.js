import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { GOLD_ASSETS } from "./gold-config.js";
const ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
// Privy's app-scoped RPC, which the embedded wallet's provider used before. viem's default mainnet
// RPC (eth.merkle.io) refuses the browser's CORS preflight, so every balance read would fail.
const PRIVY_RPC = { ethereum: "https://mainnet.rpc.privy.systems", base: "https://base-mainnet.rpc.privy.systems" };
const clients = {};
export async function readGoldBalance(network, owner, reader) {
  const asset = GOLD_ASSETS[network];
  if (!asset || !owner) throw new Error("Carteira ou rede indisponível.");
  const rpc = `${PRIVY_RPC[network]}?privyAppId=${encodeURIComponent(import.meta.env?.VITE_PRIVY_APP_ID || "")}`;
  const client = reader || (clients[network] ??= createPublicClient({ chain: asset.chain, transport: http(rpc) }));
  const raw = await client.readContract({ address: asset.address, abi: ABI, functionName: "balanceOf", args: [owner] });
  return { raw, paxg: Number(formatUnits(raw, 18)), grams: Number(formatUnits(raw, 18)) * 31.1034768 };
}
