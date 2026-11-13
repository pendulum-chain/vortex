/**
 * External contract: the Base Nabla BRLA pool read by the stocks DEX-fee rebate (docs/operations-testing.md).
 *
 * With STOCKS_NABLA_USER_FEE_BPS set, calculateNablaSwapOutputEvm prices the Pix stock swap with the router's
 * getAmountOut(amountIn, path, oraclePrices) instead of the quoter, and calculateNablaFeeSubsidy rebates its second
 * return value. That relies on three properties of the deployed router: prices go in path order, the first value is
 * the same net output the quoter returns, and the second is the DEX fee in output-token units. The hermetic rebate
 * suite (stocks-nabla-fee-subsidy.test.ts) pins the request the production code sends; this live half pins the
 * answers. Read-only: nothing is signed or sent. An RPC failure, or a pool that cannot quote the pair at all, is
 * inconclusive rather than failed.
 */
import { describe, expect, test } from "bun:test";
import {
  ERC20_BRLA_BASE,
  EvmClientManager,
  NABLA_QUOTER_BASE_BRLA,
  NABLA_ROUTER_BASE_BRLA,
  Networks,
  RELAY_BASE_USDC_ADDRESS
} from "@vortexfi/shared";
import { parseAbi, parseUnits } from "viem";
import { calculateNablaFeeSubsidy } from "../../api/services/phases/blocks/core/nabla-fee-subsidy";
import { assertLiveCoverage, runLive } from "../../test-utils/contract-support";

const RUN_LIVE = !!process.env.RUN_LIVE_TESTS;

const abi = parseAbi([
  "function oracleAdapter() view returns(address)",
  "function getAssetPrice(address) view returns(uint256)",
  "function getAmountOut(uint256,address[],uint256[]) view returns(uint256,uint256)",
  "function quoteSwapExactTokensForTokens(uint256,address[],address[]) view returns(uint256)"
]);

const PAIRS: { amountIn: bigint; label: string; path: `0x${string}`[] }[] = [
  { amountIn: parseUnits("5000", 18), label: "Pix stock buy: BRLA to USDC", path: [ERC20_BRLA_BASE, RELAY_BASE_USDC_ADDRESS] },
  { amountIn: parseUnits("1000", 6), label: "Pix stock sale: USDC to BRLA", path: [RELAY_BASE_USDC_ADDRESS, ERC20_BRLA_BASE] }
];

async function readAtOneBlock(amountIn: bigint, tokenPath: `0x${string}`[]) {
  const client = EvmClientManager.getInstance().getClient(Networks.Base);
  const blockNumber = await client.getBlockNumber();
  const oracle = await client.readContract({ abi, address: NABLA_ROUTER_BASE_BRLA, blockNumber, functionName: "oracleAdapter" });
  const prices = await Promise.all(
    tokenPath.map(asset => client.readContract({ abi, address: oracle, args: [asset], blockNumber, functionName: "getAssetPrice" }))
  );
  const [[net, fee], quoted] = await Promise.all([
    client.readContract({
      abi,
      address: NABLA_ROUTER_BASE_BRLA,
      args: [amountIn, tokenPath, prices],
      blockNumber,
      functionName: "getAmountOut"
    }),
    client.readContract({
      abi,
      address: NABLA_QUOTER_BASE_BRLA,
      args: [amountIn, tokenPath, [NABLA_ROUTER_BASE_BRLA]],
      blockNumber,
      functionName: "quoteSwapExactTokensForTokens"
    })
  ]);
  return { fee, net, quoted };
}

describe.skipIf(!RUN_LIVE)("Base Nabla router contract — live", () => {
  test.each(PAIRS)(
    "$label: getAmountOut returns the quoter's net output and a fee in output-token units",
    async ({ amountIn, label, path }) => {
      const answer = await runLive(label, () => readAtOneBlock(amountIn, path));
      if (!answer) return;
      expect(answer.net).toBe(answer.quoted);
      // A fee in input-token units would be off by about 1e12 in either direction, never within 1% of the gross output.
      expect(answer.fee).toBeGreaterThan(0n);
      expect(answer.fee * 100n).toBeLessThanOrEqual(answer.net + answer.fee);
      // The documented rebate settings (5 bps retained, 20 bps cap) must fit the live pool fee without a 503.
      expect(() => calculateNablaFeeSubsidy(answer.net.toString(), answer.fee.toString(), 5, 20)).not.toThrow();
    },
    30000
  );
});

test.skipIf(!RUN_LIVE)("live contract coverage actually ran", () => {
  assertLiveCoverage();
});
