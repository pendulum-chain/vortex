import { getNetworkId, type PresignedTx } from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, getAddress, parseTransaction, recoverTransactionAddress } from "viem";
import { POLYGON_EURE, POLYGON_EURE_USDC_FEE, POLYGON_UNISWAP_V3_ROUTER, POLYGON_USDC, uniswapV3RouterAbi } from "./contract";

export interface UniswapV3SwapExpectation {
  amountInRaw: string;
  deadline: string;
  hardMinimumOutputRaw: string;
  signer: `0x${string}`;
}

function sameAddress(left: unknown, right: string): boolean {
  return typeof left === "string" && getAddress(left) === getAddress(right);
}

async function parseSignedTransaction(tx: PresignedTx, phase: "uniswapApprove" | "uniswapSwap") {
  if (tx.phase !== phase || tx.network !== "polygon" || typeof tx.txData !== "string") {
    throw new Error(`Uniswap ${phase} transaction identity is invalid`);
  }
  const serializedTransaction = tx.txData as `0x${string}`;
  const parsed = parseTransaction(serializedTransaction);
  const signer = await recoverTransactionAddress({
    serializedTransaction: serializedTransaction as Parameters<typeof recoverTransactionAddress>[0]["serializedTransaction"]
  });
  if (
    parsed.chainId !== getNetworkId(tx.network) ||
    parsed.nonce === undefined ||
    !sameAddress(signer, tx.signer) ||
    (parsed.value ?? 0n) !== 0n
  ) {
    throw new Error(`Uniswap ${phase} signer, chain, nonce, or value is invalid`);
  }
  return { parsed, serializedTransaction, signer };
}

export async function validateUniswapApproval(tx: PresignedTx, expectation: UniswapV3SwapExpectation): Promise<`0x${string}`> {
  const { parsed, serializedTransaction, signer } = await parseSignedTransaction(tx, "uniswapApprove");
  if (!sameAddress(signer, expectation.signer) || !sameAddress(parsed.to, POLYGON_EURE)) {
    throw new Error("Uniswap approval signer or token does not match the fixed route");
  }
  const decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data ?? "0x" });
  const [spender, amount] = decoded.args;
  if (
    decoded.functionName !== "approve" ||
    !sameAddress(spender, POLYGON_UNISWAP_V3_ROUTER) ||
    amount !== BigInt(expectation.amountInRaw)
  ) {
    throw new Error("Uniswap approval does not grant the exact fixed-route allowance");
  }
  return serializedTransaction;
}

export async function validateUniswapSwap(tx: PresignedTx, expectation: UniswapV3SwapExpectation): Promise<`0x${string}`> {
  const { parsed, serializedTransaction, signer } = await parseSignedTransaction(tx, "uniswapSwap");
  if (!sameAddress(signer, expectation.signer) || !sameAddress(parsed.to, POLYGON_UNISWAP_V3_ROUTER)) {
    throw new Error("Uniswap swap signer or router does not match the fixed route");
  }
  const decoded = decodeFunctionData({ abi: uniswapV3RouterAbi, data: parsed.data ?? "0x" });
  if (decoded.functionName !== "exactInputSingle") throw new Error("Uniswap swap call is not exactInputSingle");
  const params = decoded.args[0];
  if (
    !sameAddress(params.tokenIn, POLYGON_EURE) ||
    !sameAddress(params.tokenOut, POLYGON_USDC) ||
    params.fee !== POLYGON_EURE_USDC_FEE ||
    !sameAddress(params.recipient, expectation.signer) ||
    params.deadline !== BigInt(expectation.deadline) ||
    params.amountIn !== BigInt(expectation.amountInRaw) ||
    params.amountOutMinimum !== BigInt(expectation.hardMinimumOutputRaw) ||
    params.sqrtPriceLimitX96 !== 0n
  ) {
    throw new Error("Uniswap swap does not match the fixed Polygon EURe/USDC route");
  }
  return serializedTransaction;
}
