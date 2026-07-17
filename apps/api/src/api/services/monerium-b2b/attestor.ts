import { Address, encodePacked, Hex, keccak256, serializeSignature, stringToBytes } from "viem";
import { privateKeyToAccount, sign } from "viem/accounts";
import { config } from "../../../config/vars";

/**
 * Attestor signature construction for VortexForwarder address linking.
 *
 * Mirrors contracts/monerium-forwarder/src/VortexForwarder.sol `isValidSignature`:
 * the forwarder returns the EIP-1271 magic value iff the presented hash is one of the
 * two whitelisted link hashes (EIP-191 personal-message hash or raw keccak of
 * LINK_MESSAGE) and the 65-byte (r,s,v; v in 27/28; low-s) signature recovers the
 * ATTESTOR over `keccak256(abi.encodePacked(address(this), hash))`.
 *
 * The attestor key authorizes NOTHING beyond this fixed link statement — it can never
 * move funds (security-spec/05-integrations/monerium-b2b.md).
 */

export const LINK_MESSAGE = "I hereby declare that I am the address owner.";

export type LinkHashVariant = "eip191" | "raw";

export interface LinkAttestation {
  boundHash: Hex;
  linkHash: Hex;
  message: string;
  signature: Hex;
}

/** LINK_HASH_191 / LINK_HASH_RAW from the forwarder immutables. */
export function linkMessageHash(variant: LinkHashVariant = "eip191"): Hex {
  if (variant === "raw") {
    return keccak256(stringToBytes(LINK_MESSAGE));
  }
  // hashMessage would work too; spelled out to match the Solidity constant byte for byte
  // (LINK_MESSAGE is 45 bytes, hence the fixed "\x19Ethereum Signed Message:\n45").
  return keccak256(stringToBytes(`\x19Ethereum Signed Message:\n45${LINK_MESSAGE}`));
}

/** `bound = keccak256(abi.encodePacked(forwarderAddress, hash))` — the digest the attestor signs. */
export function attestationBoundHash(forwarderAddress: Address, hash: Hex): Hex {
  return keccak256(encodePacked(["address", "bytes32"], [forwarderAddress, hash]));
}

function attestorPrivateKey(): Hex {
  const key = config.moneriumB2b.attestorPrivateKey;
  if (!key) {
    // Never include key material in errors or logs.
    throw new Error("MONERIUM_B2B_ATTESTOR_PRIVATE_KEY is not configured");
  }
  return key as Hex;
}

export function attestorAddress(): Address {
  return privateKeyToAccount(attestorPrivateKey()).address;
}

/**
 * Builds the attestor signature submitted with Monerium's POST /addresses link call.
 * Signs the bound digest directly (no extra EIP-191 prefix — the contract ecrecovers
 * the bound hash as-is). viem's signer emits canonical low-s signatures, so the
 * forwarder's malleability check passes.
 *
 * Defaults to the EIP-191 variant (personal_sign is what Monerium documents for the
 * link message). TODO(sandbox/T4): confirm during the G0 whitelabel spike which hash
 * Monerium's EIP-1271 validation presents and pin the variant.
 */
export async function signLinkAttestation(
  forwarderAddress: Address,
  variant: LinkHashVariant = "eip191"
): Promise<LinkAttestation> {
  const linkHash = linkMessageHash(variant);
  const boundHash = attestationBoundHash(forwarderAddress, linkHash);
  const signature = await sign({ hash: boundHash, privateKey: attestorPrivateKey() });
  return {
    boundHash,
    linkHash,
    message: LINK_MESSAGE,
    // 65-byte r ‖ s ‖ v serialization with v in 27/28, as isValidSignature expects.
    signature: serializeSignature(signature)
  };
}
