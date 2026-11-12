import { createPublicClient, formatUnits, http, parseAbi } from "viem";
import { GOLD_ASSETS } from "./gold-config.js";
const ABI = parseAbi(["function balanceOf(address owner) view returns (uint256)"]);
const clients = {};
export async function readGoldBalance(network, owner, reader) {
  const asset = GOLD_ASSETS[network];
  if (!asset || !owner) throw new Error("Carteira ou rede indisponível.");
  const client = reader || (clients[network] ??= createPublicClient({ chain: asset.chain, transport: http() }));
  const raw = await client.readContract({ address: asset.address, abi: ABI, functionName: "balanceOf", args: [owner] });
  return { raw, paxg: Number(formatUnits(raw, 18)), grams: Number(formatUnits(raw, 18)) * 31.1034768 };
}
