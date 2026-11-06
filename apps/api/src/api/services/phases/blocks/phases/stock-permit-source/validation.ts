import { isSignedTypedData, isSignedTypedDataArray, type PresignedTx, type SignedTypedData } from "@vortexfi/shared";
import { decodeFunctionData, isAddressEqual, parseTransaction } from "viem";
import { moneriumTransferFromAbi } from "../monerium-self-transfer/contract";

export interface StockPermitExpectation {
  amountRaw: string;
  ephemeral: `0x${string}`;
  owner: `0x${string}`;
  tokenAddress: `0x${string}`;
}

export interface ValidatedStockPermit {
  deadline: bigint;
  nonce: bigint;
  signature: { r: `0x${string}`; s: `0x${string}`; v: number };
}

function isSameAddress(left: unknown, right: `0x${string}`): boolean {
  return typeof left === "string" && isAddressEqual(left as `0x${string}`, right);
}

function singleTypedData(txData: PresignedTx["txData"]): SignedTypedData {
  if (isSignedTypedData(txData)) return txData;
  if (isSignedTypedDataArray(txData) && txData.length === 1) return txData[0];
  throw new Error("Stock permit must contain exactly one EIP-712 payload");
}

/** `validatePresignedTxs` compares these with their blueprints. This binds them to the registered sale. */
export function readStockPermit(signedTx: PresignedTx, expectation: StockPermitExpectation): ValidatedStockPermit {
  const { domain, message, primaryType, signature } = singleTypedData(signedTx.txData);
  if (!signature || Array.isArray(signature)) throw new Error("Stock permit must carry exactly one signature");
  if (
    primaryType !== "Permit" ||
    !isSameAddress(domain.verifyingContract, expectation.tokenAddress) ||
    !isSameAddress(message.owner, expectation.owner) ||
    !isSameAddress(message.spender, expectation.ephemeral) ||
    String(message.value) !== expectation.amountRaw
  ) {
    throw new Error("Stock permit does not match the registered sale");
  }
  return { deadline: BigInt(String(message.deadline)), nonce: BigInt(String(message.nonce)), signature };
}

export function readStockTransfer(
  signedTx: PresignedTx,
  expectation: StockPermitExpectation
): { nonce: number; transaction: `0x${string}` } {
  if (typeof signedTx.txData !== "string") throw new Error("Stock transferFrom must be a signed raw transaction");
  const transaction = signedTx.txData as `0x${string}`;
  const parsed = parseTransaction(transaction);
  const { args } = decodeFunctionData({ abi: moneriumTransferFromAbi, data: parsed.data ?? "0x" });
  if (
    parsed.nonce === undefined ||
    !isSameAddress(parsed.to, expectation.tokenAddress) ||
    !isSameAddress(args[0], expectation.owner) ||
    !isSameAddress(args[1], expectation.ephemeral) ||
    args[2] !== BigInt(expectation.amountRaw)
  ) {
    throw new Error("Stock transferFrom does not match the registered sale");
  }
  return { nonce: parsed.nonce, transaction };
}
