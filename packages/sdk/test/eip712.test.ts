import { describe, expect, it } from "bun:test";
import { attachSignatures, splitSignature, typedDataToSign, userTransactionType } from "../src/eip712";

const tx = (txData: unknown) => ({ meta: {}, network: "polygon", nonce: 0, phase: "squidRouterPermitExecute", signer: "0xabc", txData }) as never;

const saltPermit = {
  // domain key order is intentionally non-canonical (as Polygon USDC returns it)
  domain: { name: "USD Coin", salt: "0x0000000000000000000000000000000000000000000000000000000000000089", verifyingContract: "0xc2", version: "2" },
  message: { deadline: "1700000000", nonce: "0", owner: "0xabc", spender: "0xdef", value: "10" },
  primaryType: "Permit",
  types: { Permit: [{ name: "owner", type: "address" }] }
};

describe("userTransactionType", () => {
  it("classifies a single typed-data payload", () => {
    expect(userTransactionType(tx(saltPermit))).toBe("evm-typed-data");
  });
  it("classifies an array of typed-data payloads", () => {
    expect(userTransactionType(tx([saltPermit, saltPermit]))).toBe("evm-typed-data");
  });
  it("classifies a raw EVM transaction (object)", () => {
    expect(userTransactionType(tx({ data: "0x", gas: "21000", to: "0x1", value: "0" }))).toBe("evm-transaction");
  });
  it("does not classify Substrate hex strings as EVM transactions", () => {
    expect(userTransactionType(tx("0xdeadbeef"))).toBe("unsupported");
  });
});

describe("typedDataToSign", () => {
  it("returns raw payloads for wagmi/viem (no EIP712Domain) by default", () => {
    const [payload] = typedDataToSign(tx(saltPermit));
    expect("EIP712Domain" in payload.types).toBe(false);
  });

  it("returns every payload in a multi-payload tx", () => {
    expect(typedDataToSign(tx([saltPermit, saltPermit]))).toHaveLength(2);
  });

  it("emits EIP712Domain in CANONICAL order for eth_signTypedData_v4 (not domain key order)", () => {
    const [payload] = typedDataToSign(tx(saltPermit), { includeDomainType: true });
    // Domain object order is name, salt, verifyingContract, version — but ethers/viem require
    // name, version, verifyingContract, salt. A wrong order broke signature recovery in testing.
    expect((payload.types.EIP712Domain as { name: string }[]).map(f => f.name)).toEqual([
      "name",
      "version",
      "verifyingContract",
      "salt"
    ]);
  });

  it("includes chainId (and omits salt) for a standard domain", () => {
    const standard = { ...saltPermit, domain: { chainId: 137, name: "X", verifyingContract: "0x1", version: "1" } };
    const [payload] = typedDataToSign(tx(standard), { includeDomainType: true });
    expect((payload.types.EIP712Domain as { name: string }[]).map(f => f.name)).toEqual([
      "name",
      "version",
      "chainId",
      "verifyingContract"
    ]);
  });

  it("overrides a non-canonical existing EIP712Domain entry", () => {
    const withDomainType = {
      ...saltPermit,
      types: {
        EIP712Domain: [
          { name: "salt", type: "bytes32" },
          { name: "name", type: "string" }
        ],
        Permit: [{ name: "owner", type: "address" }]
      }
    };

    const [payload] = typedDataToSign(tx(withDomainType), { includeDomainType: true });

    expect((payload.types.EIP712Domain as { name: string }[]).map(f => f.name)).toEqual([
      "name",
      "version",
      "verifyingContract",
      "salt"
    ]);
  });
});

describe("attachSignatures", () => {
  const sig = `0x${"a".repeat(64)}${"b".repeat(64)}1b`;

  it("attaches a {v,r,s,deadline} signature to each payload", () => {
    const [signed] = attachSignatures(tx(saltPermit), [sig]);
    expect(signed.signature).toEqual({ deadline: 1700000000, r: `0x${"a".repeat(64)}`, s: `0x${"b".repeat(64)}`, v: 27 });
  });

  it("signs every payload of a multi-payload tx", () => {
    expect(attachSignatures(tx([saltPermit, saltPermit]), [sig, sig])).toHaveLength(2);
  });

  it("throws when the signature count does not match the payload count", () => {
    expect(() => attachSignatures(tx([saltPermit, saltPermit]), [sig])).toThrow();
  });

  it("throws when the transaction has no typed-data payloads", () => {
    expect(() => attachSignatures(tx({ data: "0x", to: "0x1", value: "0" }), [sig])).toThrow();
  });
});

describe("splitSignature", () => {
  const sig = `0x${"a".repeat(64)}${"b".repeat(64)}1b`;
  it("splits a 65-byte hex signature into v/r/s", () => {
    expect(splitSignature(sig)).toEqual({ r: `0x${"a".repeat(64)}`, s: `0x${"b".repeat(64)}`, v: 27 });
  });
  it("tolerates surrounding quotes and whitespace", () => {
    expect(splitSignature(`  '${sig}' `)).toEqual({ r: `0x${"a".repeat(64)}`, s: `0x${"b".repeat(64)}`, v: 27 });
  });
  it("normalizes v from 0/1 to 27/28", () => {
    expect(splitSignature(`0x${"a".repeat(64)}${"b".repeat(64)}00`).v).toBe(27);
  });
  it("rejects a wrong-length signature", () => {
    expect(() => splitSignature("0x1234")).toThrow();
  });
});
