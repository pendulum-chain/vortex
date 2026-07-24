import { afterAll, beforeAll, describe, expect, it } from "bun:test";
import { Address, encodePacked, hashMessage, Hex, hexToBigInt, hexToNumber, keccak256, recoverAddress, slice } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { config } from "../../../config/vars";
import { attestationBoundHash, attestorAddress, LINK_MESSAGE, linkMessageHash, signLinkAttestation } from "./attestor";

// Well-known test key (Foundry/Anvil account #0) — never a real attestor key.
const TEST_KEY: Hex = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
const FORWARDER: Address = "0x1111111111111111111111111111111111111111";
const CHAIN_ID = 11155111n; // Sepolia, matching the G0 sandbox validation
// Malleability bound from VortexForwarder.isValidSignature (secp256k1 n/2).
const HALF_ORDER = hexToBigInt("0x7FFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF5D576E7357A4501DDFE92F46681B20A0");

let originalKey: string | undefined;

beforeAll(() => {
  originalKey = config.moneriumB2b.attestorPrivateKey;
  config.moneriumB2b.attestorPrivateKey = TEST_KEY;
});

afterAll(() => {
  config.moneriumB2b.attestorPrivateKey = originalKey;
});

describe("monerium-b2b attestor", () => {
  it("derives LINK_HASH_191 exactly as the forwarder immutable", () => {
    // The Solidity constant hardcodes "\x19Ethereum Signed Message:\n45" — LINK_MESSAGE must be 45 bytes.
    expect(Buffer.byteLength(LINK_MESSAGE, "utf8")).toBe(45);
    // Independent derivation via viem's EIP-191 implementation.
    expect(linkMessageHash()).toBe(hashMessage(LINK_MESSAGE));
  });

  it("binds the signature to chainid + forwarder address exactly like isValidSignature", async () => {
    const attestation = await signLinkAttestation(CHAIN_ID, FORWARDER);
    // bound = keccak256(abi.encodePacked(block.chainid, address(this), hash)) — contract-side recomputation.
    const expectedBound = keccak256(
      encodePacked(["uint256", "address", "bytes32"], [CHAIN_ID, FORWARDER, hashMessage(LINK_MESSAGE)])
    );
    expect(attestation.boundHash).toBe(expectedBound);
    expect(attestation.linkHash).toBe(hashMessage(LINK_MESSAGE));
    expect(attestation.message).toBe(LINK_MESSAGE);
    // ecrecover(bound, v, r, s) must yield the ATTESTOR.
    const signer = await recoverAddress({ hash: expectedBound, signature: attestation.signature });
    expect(signer).toBe(privateKeyToAccount(TEST_KEY).address);
    expect(signer).toBe(attestorAddress());
  });

  it("emits a 65-byte low-s signature with v in 27/28", async () => {
    const { boundHash, linkHash, signature } = await signLinkAttestation(CHAIN_ID, FORWARDER);
    expect(signature.length).toBe(2 + 65 * 2);
    const v = hexToNumber(slice(signature, 64, 65));
    expect([27, 28]).toContain(v);
    const s = hexToBigInt(slice(signature, 32, 64));
    expect(s <= HALF_ORDER).toBe(true);
    expect(boundHash).toBe(attestationBoundHash(CHAIN_ID, FORWARDER, linkHash));
    expect(await recoverAddress({ hash: boundHash, signature })).toBe(privateKeyToAccount(TEST_KEY).address);
  });

  it("does not verify against a different forwarder address or chain", async () => {
    const { signature } = await signLinkAttestation(CHAIN_ID, FORWARDER);
    const otherAddress = attestationBoundHash(CHAIN_ID, "0x2222222222222222222222222222222222222222", linkMessageHash());
    expect(await recoverAddress({ hash: otherAddress, signature })).not.toBe(privateKeyToAccount(TEST_KEY).address);
    // Cross-chain replay: same address, different chainid must not recover the attestor.
    const otherChain = attestationBoundHash(1n, FORWARDER, linkMessageHash());
    expect(await recoverAddress({ hash: otherChain, signature })).not.toBe(privateKeyToAccount(TEST_KEY).address);
  });

  it("refuses to sign when the attestor key is not configured", async () => {
    config.moneriumB2b.attestorPrivateKey = undefined;
    try {
      await expect(signLinkAttestation(CHAIN_ID, FORWARDER)).rejects.toThrow("MONERIUM_B2B_ATTESTOR_PRIVATE_KEY");
    } finally {
      config.moneriumB2b.attestorPrivateKey = TEST_KEY;
    }
  });
});
