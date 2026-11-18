import { Networks } from "@vortexfi/shared";
import { decodeFunctionData, parseAbi, parseTransaction } from "viem";
import {
  BASE_PANCAKE_V3_FACTORY,
  BASE_PANCAKE_V3_QUOTER_V2,
  BASE_PANCAKE_V3_ROUTER,
  BASE_PAXG_ADDRESS,
  BASE_PAXG_USD_FEED,
  BASE_PAXG_USDC_POOL,
  BASE_PAXG_USDC_POOL_FEE,
  BASE_USDC_ADDRESS
} from "../../api/services/phases/blocks/core/gold-base";
import type { FakeEvm, RecordedEvmTx } from "./fake-evm";
import type { TokenLedger } from "./robinhood-chain";

const same = (left: string, right: string) => left.toLowerCase() === right.toLowerCase();

/** What `amountIn` swaps to at exactly `priceUsd` USDC per PAXG: USDC has 6 decimals, PAXG 18. */
export const goldSwapOutput = (amountIn: bigint, fromUsdc: boolean, priceUsd: bigint) =>
  fromUsdc ? (amountIn * 10n ** 12n) / priceUsd : (amountIn * priceUsd) / 10n ** 12n;

/**
 * Answers what a Gold quote reads on Base: a fresh Chainlink PAXG/USD round, the pinned PancakeSwap deployment, PAXG's
 * permit name, and QuoterV2 swapping at exactly `priceUsd`. Everything else falls through to the handlers already
 * scripted, so a test keeps its own Nabla quote and its Robinhood Chain script.
 */
export function scriptGoldBase(evm: FakeEvm, priceUsd: bigint): void {
  const scriptedRead = evm.onReadContract;
  const scriptedSimulate = evm.onSimulateContract;
  evm.onReadContract = (network, params) => {
    if (network === Networks.Base) {
      const { address, functionName } = params;
      if (same(address, BASE_PAXG_USD_FEED) && functionName === "latestRoundData") {
        return [1n, priceUsd * 100_000_000n, 0n, BigInt(Math.floor(Date.now() / 1000)), 1n] as const;
      }
      if (same(address, BASE_PAXG_ADDRESS) && functionName === "name") return "Paxos Gold";
      if (same(address, BASE_PANCAKE_V3_FACTORY) && functionName === "getPool") return BASE_PAXG_USDC_POOL;
      if (
        functionName === "factory" &&
        [BASE_PANCAKE_V3_ROUTER, BASE_PANCAKE_V3_QUOTER_V2, BASE_PAXG_USDC_POOL].some(pin => same(address, pin))
      ) {
        return BASE_PANCAKE_V3_FACTORY;
      }
      if (same(address, BASE_PAXG_USDC_POOL)) {
        const [token0, token1] = [BASE_USDC_ADDRESS, BASE_PAXG_ADDRESS].sort((left, right) =>
          BigInt(left) < BigInt(right) ? -1 : 1
        );
        if (functionName === "fee") return BASE_PAXG_USDC_POOL_FEE;
        if (functionName === "token0") return token0;
        if (functionName === "token1") return token1;
      }
    }
    return scriptedRead?.(network, params);
  };
  evm.onSimulateContract = (network, params) => {
    if (network !== Networks.Base || !same(params.address, BASE_PANCAKE_V3_QUOTER_V2)) {
      return scriptedSimulate?.(network, params);
    }
    if (params.functionName === "quoteExactOutputSingle") {
      const [{ amount }] = params.args as [{ amount: bigint }];
      return [(amount * priceUsd + 10n ** 12n - 1n) / 10n ** 12n, 0n, 0, 115_000n] as const;
    }
    const [path, amountIn] = params.args as [string, bigint];
    const fromUsdc = same(path.slice(0, 42), BASE_USDC_ADDRESS);
    return [goldSwapOutput(amountIn, fromUsdc, priceUsd), [], [], 115_000n] as const;
  };
}

const pancakeRouterAbi = parseAbi([
  "function exactInput((bytes path,address recipient,uint256 deadline,uint256 amountIn,uint256 amountOutMinimum) params) payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn,address tokenOut,uint24 fee,address recipient,uint256 deadline,uint256 amountOut,uint256 amountInMaximum,uint160 sqrtPriceLimitX96) params) payable returns (uint256 amountIn)"
]);

/**
 * The pinned PancakeSwap router's effect on a `TokenLedger`, for a transaction the ledger has already applied (which
 * charged a raw transaction's gas and nonce). `fillBps` below 10,000 means the pool moved against an exact-input swap
 * after its quote. A call that cannot complete mines as reverted.
 */
export function applyGoldRouterTx(
  evm: FakeEvm,
  ledger: TokenLedger,
  tx: RecordedEvmTx,
  rawSender: string,
  priceUsd: bigint,
  fillBps = 10_000n
): void {
  const call = tx.serialized ? parseTransaction(tx.serialized as `0x${string}`) : { data: tx.data, to: tx.to };
  if (tx.network !== Networks.Base || !call.to || !call.data || !same(call.to, BASE_PANCAKE_V3_ROUTER)) return;
  const sender = tx.from ?? rawSender;
  const now = BigInt(Math.floor(Date.now() / 1000));
  const decoded = decodeFunctionData({ abi: pancakeRouterAbi, data: call.data as `0x${string}` });
  if (decoded.functionName === "exactInput") {
    const [{ amountIn, amountOutMinimum, deadline, path, recipient }] = decoded.args;
    const tokenIn = path.slice(0, 42);
    const amountOut = (goldSwapOutput(amountIn, same(tokenIn, BASE_USDC_ADDRESS), priceUsd) * fillBps) / 10_000n;
    if (deadline < now || amountOut < amountOutMinimum) {
      evm.revertedReceiptHashes.add(tx.hash);
      return;
    }
    if (ledger.pull(tx, tokenIn, sender, BASE_PANCAKE_V3_ROUTER, BASE_PANCAKE_V3_ROUTER, amountIn)) {
      ledger.credit(tx.network, `0x${path.slice(-40)}`, recipient, amountOut);
    }
    return;
  }
  const [{ amountInMaximum, amountOut, deadline, recipient, tokenIn, tokenOut }] = decoded.args;
  const amountIn = (amountOut * priceUsd + 10n ** 12n - 1n) / 10n ** 12n;
  if (deadline < now || amountIn > amountInMaximum) {
    evm.revertedReceiptHashes.add(tx.hash);
    return;
  }
  if (ledger.pull(tx, tokenIn, sender, BASE_PANCAKE_V3_ROUTER, BASE_PANCAKE_V3_ROUTER, amountIn)) {
    ledger.credit(tx.network, tokenOut, recipient, amountOut);
  }
}
