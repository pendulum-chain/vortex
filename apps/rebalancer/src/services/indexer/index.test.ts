import { afterEach, describe, expect, spyOn, test } from "bun:test";
import { ERC20_BRLA_BASE, EvmClientManager } from "@vortexfi/shared";
import { USDC_BASE } from "../../rebalance/usdc-brla-usdc-base/steps.ts";
import { getBaseNablaCoverageRatio, getBaseNablaUsdcPool } from "./index.ts";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

interface ReadContractArgs {
  address: string;
  args?: unknown[];
  functionName: string;
}

// Fakes the Base client: poolByAsset maps an asset to a pool, reserve/totalLiabilities read that pool.
function stubBaseClient(pools: Record<string, { address: string; reserve: bigint; liabilities: bigint }>) {
  const readContract = async ({ address, args, functionName }: ReadContractArgs) => {
    if (functionName === "poolByAsset") return pools[String(args?.[0])]?.address ?? ZERO_ADDRESS;
    const pool = Object.values(pools).find(p => p.address === address);
    if (!pool) throw new Error(`unexpected pool ${address}`);
    return functionName === "reserve" ? pool.reserve : pool.liabilities;
  };
  return spyOn(EvmClientManager, "getInstance").mockReturnValue({
    getClient: () => ({ readContract })
  } as unknown as EvmClientManager);
}

afterEach(() => {
  (EvmClientManager.getInstance as unknown as { mockRestore?: () => void }).mockRestore?.();
});

describe("getBaseNablaCoverageRatio", () => {
  test("divides the BRLA pool reserve by its liabilities", async () => {
    stubBaseClient({ [ERC20_BRLA_BASE]: { address: "0xb", liabilities: 1000n, reserve: 194n } });

    expect(await getBaseNablaCoverageRatio()).toEqual({ brlaCoverageRatio: 0.194 });
  });

  test("reports zero coverage when the pool has no liabilities", async () => {
    stubBaseClient({ [ERC20_BRLA_BASE]: { address: "0xb", liabilities: 0n, reserve: 5n } });

    expect(await getBaseNablaCoverageRatio()).toEqual({ brlaCoverageRatio: 0 });
  });

  test("returns undefined when the router has no BRLA pool", async () => {
    stubBaseClient({});

    expect(await getBaseNablaCoverageRatio()).toBeUndefined();
  });

  test("returns undefined when a pool read fails", async () => {
    spyOn(EvmClientManager, "getInstance").mockReturnValue({
      getClient: () => ({
        readContract: async () => {
          throw new Error("rpc down");
        }
      })
    } as unknown as EvmClientManager);

    expect(await getBaseNablaCoverageRatio()).toBeUndefined();
  });
});

describe("getBaseNablaUsdcPool", () => {
  test("returns the USDC pool reserve and liabilities as raw strings", async () => {
    stubBaseClient({
      [ERC20_BRLA_BASE]: { address: "0xb", liabilities: 1n, reserve: 1n },
      [USDC_BASE]: { address: "0xu", liabilities: 19344706790n, reserve: 37747254751n }
    });

    expect(await getBaseNablaUsdcPool()).toEqual({ liabilitiesRaw: "19344706790", reserveRaw: "37747254751" });
  });

  test("throws when the router has no USDC pool", async () => {
    stubBaseClient({});

    await expect(getBaseNablaUsdcPool()).rejects.toThrow("No pool found on Base Nabla router");
  });
});
