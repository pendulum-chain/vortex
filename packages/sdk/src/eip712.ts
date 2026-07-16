import {
  type EvmTransactionData,
  isEvmTransactionData,
  isSignedTypedData,
  isSignedTypedDataArray,
  type SignedTypedData,
  type UnsignedTx
} from "@vortexfi/shared";

export type UserTransactionType = "evm-typed-data" | "evm-transaction" | "unsupported";

export const EIP712_DOMAIN_FIELD_TYPES: Record<string, string> = {
  chainId: "uint256",
  name: "string",
  salt: "bytes32",
  verifyingContract: "address",
  version: "string"
};

// Canonical EIP712Domain field order (ethers/viem use this). Required when emitting a payload for
// the low-level eth_signTypedData_v4 JSON-RPC call, which needs the EIP712Domain type spelled out.
// A non-canonical order produces a different domain hash and breaks signature recovery.
export const EIP712_DOMAIN_FIELD_ORDER = ["name", "version", "chainId", "verifyingContract", "salt"];

export function userTransactionType(tx: UnsignedTx): UserTransactionType {
  if (isSignedTypedData(tx.txData) || isSignedTypedDataArray(tx.txData)) {
    return "evm-typed-data";
  }

  if (isEvmTransactionData(tx.txData)) {
    return "evm-transaction";
  }

  return "unsupported";
}

export function typedDataToSign(tx: UnsignedTx, options: { includeDomainType?: boolean } = {}): SignedTypedData[] {
  const txDataArray = Array.isArray(tx.txData) ? tx.txData : [tx.txData];
  const items = txDataArray.filter((item): item is SignedTypedData =>
    isSignedTypedData(item as string | EvmTransactionData | SignedTypedData | SignedTypedData[])
  );
  if (!options.includeDomainType) {
    return items;
  }
  return items.map(item => ({
    ...item,
    types: {
      ...item.types,
      EIP712Domain: EIP712_DOMAIN_FIELD_ORDER.filter(field => field in item.domain).map(field => ({
        name: field,
        type: EIP712_DOMAIN_FIELD_TYPES[field]
      }))
    }
  }));
}

function typedDataDeadline(item: SignedTypedData, phase: string): number {
  const deadline = item.message.deadline;
  if (deadline === undefined || deadline === null) {
    throw new Error(`attachSignatures: phase ${phase} typed-data payload is missing a deadline.`);
  }

  const numericDeadline = Number(deadline);
  if (!Number.isFinite(numericDeadline) || !Number.isInteger(numericDeadline) || numericDeadline <= 0) {
    throw new Error(
      `attachSignatures: phase ${phase} typed-data deadline must be a positive integer, got ${String(deadline)}.`
    );
  }

  return numericDeadline;
}

/**
 * Attach user signatures to the typed-data payload(s) of a transaction, producing the signed
 * txData to submit. A transaction may carry several payloads (e.g. permit + relayer payload);
 * `signatures` must line up one-to-one, in order.
 */
export function attachSignatures(tx: UnsignedTx, signatures: string[]): SignedTypedData[] {
  const items = typedDataToSign(tx);
  if (items.length === 0) {
    throw new Error(`attachSignatures: phase ${tx.phase} has no typed-data payloads to sign.`);
  }
  if (signatures.length !== items.length) {
    throw new Error(`attachSignatures: phase ${tx.phase} expects ${items.length} signature(s), got ${signatures.length}.`);
  }
  return items.map((item, i) => {
    const { v, r, s } = splitSignature(signatures[i]);
    const deadline = typedDataDeadline(item, tx.phase);
    return { ...item, signature: { deadline, r, s, v } };
  });
}

// Split a 65-byte hex signature (eth_signTypedData_v4 / personal_sign output) into {v, r, s}.
export function splitSignature(signature: string): { v: number; r: `0x${string}`; s: `0x${string}` } {
  // Tolerate pasted values wrapped in quotes / whitespace.
  const cleaned = signature.trim().replace(/^['"]+|['"]+$/g, "");
  const hex = cleaned.startsWith("0x") ? cleaned.slice(2) : cleaned;
  if (hex.length !== 130) {
    throw new Error(`Invalid signature: expected a 65-byte hex string, got ${hex.length} hex chars.`);
  }
  if (!/^[0-9a-fA-F]+$/.test(hex)) {
    throw new Error("Invalid signature: signature must contain only hex characters.");
  }
  const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
  const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
  let v = Number.parseInt(hex.slice(128, 130), 16);
  if (v === 0 || v === 1) {
    v += 27;
  }
  if (v !== 27 && v !== 28) {
    throw new Error(`Invalid signature: v must be 0, 1, 27, or 28, got ${v}.`);
  }
  return { r, s, v };
}
