import { ERC20_BRLA_BASE, EvmClientManager, NABLA_ROUTER_BASE_BRLA, Networks } from "@vortexfi/shared";
import Big from "big.js";
import { USDC_BASE } from "../../rebalance/usdc-brla-usdc-base/steps.ts";

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

async function readBaseNablaPool(asset: `0x${string}`): Promise<{ reserve: bigint; liabilities: bigint }> {
  const baseClient = EvmClientManager.getInstance().getClient(Networks.Base);

  const poolAddress = (await baseClient.readContract({
    abi: ROUTER_ABI,
    address: NABLA_ROUTER_BASE_BRLA,
    args: [asset],
    functionName: "poolByAsset"
  })) as `0x${string}`;

  if (poolAddress === "0x0000000000000000000000000000000000000000") {
    throw new Error(`No pool found on Base Nabla router (${NABLA_ROUTER_BASE_BRLA}) for asset ${asset}.`);
  }

  const [reserve, liabilities] = await Promise.all([
    baseClient.readContract({ abi: SWAP_POOL_ABI, address: poolAddress, functionName: "reserve" }) as Promise<bigint>,
    baseClient.readContract({ abi: SWAP_POOL_ABI, address: poolAddress, functionName: "totalLiabilities" }) as Promise<bigint>
  ]);

  return { liabilities, reserve };
}

export async function getBaseNablaUsdcPool(): Promise<{ reserveRaw: string; liabilitiesRaw: string }> {
  const { reserve, liabilities } = await readBaseNablaPool(USDC_BASE);
  return { liabilitiesRaw: liabilities.toString(), reserveRaw: reserve.toString() };
}

export async function getBaseNablaCoverageRatio(): Promise<{ brlaCoverageRatio: number } | undefined> {
  try {
    const { reserve: brlaReserve, liabilities: brlaLiabilities } = await readBaseNablaPool(ERC20_BRLA_BASE);

    const brlaCoverageRatio =
      brlaLiabilities > 0n ? new Big(brlaReserve.toString()).div(new Big(brlaLiabilities.toString())).toNumber() : 0;

    console.log(`Base Nabla BRLA pool coverage ratio: ${brlaCoverageRatio}`);

    return { brlaCoverageRatio };
  } catch (error) {
    console.error("Failed to fetch Base Nabla coverage ratio:", error);
    return undefined;
  }
}
