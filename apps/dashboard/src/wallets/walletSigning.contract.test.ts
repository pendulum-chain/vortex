import {
  Networks,
  type SignedTypedData,
  type UnsignedTx
} from "@vortexfi/shared";
import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  signAndSubmitEvmTransaction,
  signMultipleTypedData
} from "@/services/transactions/userSigning";
import {
  setActiveWalletSigningAdapter,
  type WalletSigningAdapter
} from "./signingAdapter";

const address = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"cd".repeat(32)}` as `0x${string}`;
const confirmedHash = `0x${"ef".repeat(32)}` as `0x${string}`;
const rawSignature = `0x${"11".repeat(64)}1b` as `0x${string}`;

const typedData: SignedTypedData = {
  domain: {
    name: "Permit2",
    verifyingContract: "0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    version: "1"
  },
  message: { amount: "1", deadline: "123" },
  primaryType: "PermitTransferFrom",
  types: { PermitTransferFrom: [{ name: "amount", type: "uint256" }] }
};

const unsignedTx = {
  meta: {},
  network: Networks.Base,
  nonce: 0,
  phase: "squidRouterNoPermitTransfer",
  signer: address,
  txData: {
    data: "0x1234",
    gas: "21000",
    nonce: 0,
    to: "0x2222222222222222222222222222222222222222",
    value: "7"
  }
} as UnsignedTx;

function fakeAdapter(kind: WalletSigningAdapter["kind"]) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const adapter: WalletSigningAdapter = {
    address,
    kind,
    sendTransaction: async transaction => {
      calls.push({ name: "sendTransaction", value: transaction });
      return txHash;
    },
    signTypedData: async data => {
      calls.push({ name: "signTypedData", value: data });
      return rawSignature;
    },
    waitForTransaction: async (hash, chainId) => {
      calls.push({ name: "waitForTransaction", value: { chainId, hash } });
      return confirmedHash;
    }
  };
  return { adapter, calls };
}

describe("wallet signer contract", () => {
  for (const kind of ["external", "privy_embedded"] as const) {
    it(`${kind} produces the same permit and transaction result shapes`, async () => {
      const fake = fakeAdapter(kind);
      setActiveWalletSigningAdapter(fake.adapter);

      const [signed] = await signMultipleTypedData([typedData], address);
      const hash = await signAndSubmitEvmTransaction(unsignedTx);

      assert.ok(signed);
      assert.deepEqual(signed.signature, {
        deadline: 123,
        r: `0x${"11".repeat(32)}`,
        s: `0x${"11".repeat(32)}`,
        v: 27
      });
      assert.equal(hash, confirmedHash);
      assert.deepEqual(fake.calls.map(call => call.name), [
        "signTypedData",
        "sendTransaction",
        "waitForTransaction"
      ]);
      const sent = fake.calls[1]?.value as { chainId: number; gas: bigint; value: bigint };
      assert.equal(sent.chainId, 8453);
      assert.equal(sent.gas, 21000n);
      assert.equal(sent.value, 7n);
    });
  }

  it("rejects a server-issued transaction for a different signer before broadcasting", async () => {
    const fake = fakeAdapter("privy_embedded");
    setActiveWalletSigningAdapter(fake.adapter);

    await assert.rejects(
      signAndSubmitEvmTransaction({
        ...unsignedTx,
        signer: "0x2222222222222222222222222222222222222222"
      }),
      /does not match the server-issued transaction signer/
    );
    assert.equal(fake.calls.length, 0);
  });

  it("rejects typed data for a different signer before requesting a signature", async () => {
    const fake = fakeAdapter("privy_embedded");
    setActiveWalletSigningAdapter(fake.adapter);

    await assert.rejects(
      signMultipleTypedData([typedData], "0x2222222222222222222222222222222222222222"),
      /does not match the server-issued typed-data signer/
    );
    assert.equal(fake.calls.length, 0);
  });
});
