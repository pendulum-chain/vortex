import { ERC20_BRLA_BASE, EvmClientManager, NABLA_ROUTER_BASE_BRLA, Networks } from "@vortexfi/shared";
import Big from "big.js";

const SWAP_POOL_ABI = [
  {
    inputs: [],
    name: "reserve",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  },
  {
    inputs: [],
    name: "totalLiabilities",
    outputs: [{ type: "uint256" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

const ROUTER_ABI = [
  {
    inputs: [{ name: "asset", type: "address" }],
    name: "poolByAsset",
    outputs: [{ type: "address" }],
    stateMutability: "view",
    type: "function"
  }
] as const;

export async function getBaseNablaCoverageRatio(): Promise<{ brlaCoverageRatio: number } | undefined> {
  try {
    const evmClientManager = EvmClientManager.getInstance();
    const baseClient = evmClientManager.getClient(Networks.Base);

    const brlaPoolAddress = (await baseClient.readContract({
      abi: ROUTER_ABI,
      address: NABLA_ROUTER_BASE_BRLA,
      args: [ERC20_BRLA_BASE],
      functionName: "poolByAsset"
    })) as `0x${string}`;

    if (brlaPoolAddress === "0x0000000000000000000000000000000000000000") {
      console.error(`No BRLA pool found on Base Nabla router (${NABLA_ROUTER_BASE_BRLA}) for asset ${ERC20_BRLA_BASE}.`);
      return undefined;
    }
    const [brlaReserve, brlaLiabilities] = await Promise.all([
      baseClient.readContract({
        abi: SWAP_POOL_ABI,
        address: brlaPoolAddress,
        functionName: "reserve"
      }) as Promise<bigint>,
      baseClient.readContract({
        abi: SWAP_POOL_ABI,
        address: brlaPoolAddress,
        functionName: "totalLiabilities"
      }) as Promise<bigint>
    ]);

    const brlaCoverageRatio =
      brlaLiabilities > 0n ? new Big(brlaReserve.toString()).div(new Big(brlaLiabilities.toString())).toNumber() : 0;

    console.log(`Base Nabla BRLA pool coverage ratio: ${brlaCoverageRatio}`);

    return { brlaCoverageRatio };
  } catch (error) {
    console.error("Failed to fetch Base Nabla coverage ratio:", error);
    return undefined;
  }
}
