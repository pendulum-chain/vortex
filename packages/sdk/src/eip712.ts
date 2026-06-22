import type { SignedTypedData, UnsignedTx } from "@vortexfi/shared";

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

export function isTypedDataItem(item: unknown): item is SignedTypedData {
  return typeof item === "object" && item !== null && "primaryType" in item;
}

export function userTransactionType(tx: UnsignedTx): "evm-typed-data" | "evm-transaction" {
  const first = Array.isArray(tx.txData) ? tx.txData[0] : tx.txData;
  return isTypedDataItem(first) ? "evm-typed-data" : "evm-transaction";
}

export function typedDataToSign(tx: UnsignedTx, options: { includeDomainType?: boolean } = {}): SignedTypedData[] {
  const items = (Array.isArray(tx.txData) ? tx.txData : [tx.txData]).filter(isTypedDataItem);
  if (!options.includeDomainType) {
    return items;
  }
  return items.map(item => ({
    ...item,
    types: {
      EIP712Domain: EIP712_DOMAIN_FIELD_ORDER.filter(field => field in item.domain).map(field => ({
        name: field,
        type: EIP712_DOMAIN_FIELD_TYPES[field]
      })),
      ...item.types
    }
  }));
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
    const deadline = Number((item.message as Record<string, unknown>).deadline ?? 0);
    return { ...item, signature: { deadline, r, s, v } };
  });
}

// Split a 65-byte hex signature (eth_signTypedData_v4 / personal_sign output) into {v, r, s}.
export function splitSignature(signature: string): { v: number; r: `0x${string}`; s: `0x${string}` } {
  // Tolerate pasted values wrapped in quotes / whitespace.
  const cleaned = signature.trim().replace(/^['"]+|['"]+$/g, "");
  const hex = cleaned.startsWith("0x") ? cleaned.slice(2) : cleaned;
  if (hex.length !== 130) {
    throw new Error(`Invalid signature: expected a 65-byte hex string, got ${cleaned.length} chars.`);
  }
  const r = `0x${hex.slice(0, 64)}` as `0x${string}`;
  const s = `0x${hex.slice(64, 128)}` as `0x${string}`;
  let v = Number.parseInt(hex.slice(128, 130), 16);
  if (v < 27) {
    v += 27;
  }
  return { r, s, v };
}
