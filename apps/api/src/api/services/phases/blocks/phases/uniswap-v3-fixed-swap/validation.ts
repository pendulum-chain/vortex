import { getNetworkId, type PresignedTx } from "@vortexfi/shared";
import { decodeFunctionData, erc20Abi, getAddress, parseTransaction, recoverTransactionAddress } from "viem";
import { encodeUniswapSwap, POLYGON_EURE_USDC_TARGET, type UniswapSwapTarget } from "./contract";

/** Target fields default to the fixed Polygon route; the recipient defaults to the signer. */
export interface UniswapV3SwapExpectation extends Partial<UniswapSwapTarget> {
  amountInRaw: string;
  deadline: string;
  hardMinimumOutputRaw: string;
  recipient?: `0x${string}`;
  signer: `0x${string}`;
}

function sameAddress(left: unknown, right: string): boolean {
  return typeof left === "string" && getAddress(left) === getAddress(right);
}

async function parseSignedTransaction(
  tx: PresignedTx,
  phase: "uniswapApprove" | "uniswapSwap",
  network: UniswapSwapTarget["network"]
) {
  if (tx.phase !== phase || tx.network !== network || typeof tx.txData !== "string") {
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
  const target = { ...POLYGON_EURE_USDC_TARGET, ...expectation };
  const { parsed, serializedTransaction, signer } = await parseSignedTransaction(tx, "uniswapApprove", target.network);
  if (!sameAddress(signer, expectation.signer) || !sameAddress(parsed.to, target.inputToken)) {
    throw new Error("Uniswap approval signer or token does not match the fixed route");
  }
  const decoded = decodeFunctionData({ abi: erc20Abi, data: parsed.data ?? "0x" });
  const [spender, amount] = decoded.args;
  if (
    decoded.functionName !== "approve" ||
    !sameAddress(spender, target.router) ||
    amount !== BigInt(expectation.amountInRaw)
  ) {
    throw new Error("Uniswap approval does not grant the exact fixed-route allowance");
  }
  return serializedTransaction;
}

export async function validateUniswapSwap(tx: PresignedTx, expectation: UniswapV3SwapExpectation): Promise<`0x${string}`> {
  const target = { ...POLYGON_EURE_USDC_TARGET, ...expectation };
  const { parsed, serializedTransaction, signer } = await parseSignedTransaction(tx, "uniswapSwap", target.network);
  if (!sameAddress(signer, expectation.signer) || !sameAddress(parsed.to, target.router)) {
    throw new Error("Uniswap swap signer or router does not match the fixed route");
  }
  const expected = encodeUniswapSwap(target.kind, {
    amountIn: BigInt(expectation.amountInRaw),
    amountOutMinimum: BigInt(expectation.hardMinimumOutputRaw),
    deadline: BigInt(expectation.deadline),
    path: target.path,
    recipient: expectation.recipient ?? expectation.signer
  });
  if (parsed.data?.toLowerCase() !== expected.toLowerCase()) {
    throw new Error(`Uniswap swap does not match the fixed ${target.label} route`);
  }
  return serializedTransaction;
}
