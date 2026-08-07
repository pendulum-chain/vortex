import { Networks, type SignedTypedData, type UnsignedTx } from "@vortexfi/shared";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { signAndSubmitEvmTransaction, signMultipleTypedData } from "../services/transactions/userSigning";
import { cdpWidgetConfig } from "./config";
import { type EvmWalletSigningAdapter, setActiveEvmWalletSigningAdapter } from "./signingAdapter";

const address = "0x1111111111111111111111111111111111111111";
const txHash = `0x${"cd".repeat(32)}` as `0x${string}`;
const confirmedHash = `0x${"ef".repeat(32)}` as `0x${string}`;
const rawSignature = `0x${"11".repeat(64)}1b` as `0x${string}`;
const originalSigningEnabled = cdpWidgetConfig.signingEnabled;
let confirmAction = vi.fn(() => true);

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
    maxFeePerGas: "3000000000",
    maxPriorityFeePerGas: "1000000000",
    nonce: 0,
    to: "0x2222222222222222222222222222222222222222",
    value: "7"
  }
} as UnsignedTx;

function fakeAdapter(kind: EvmWalletSigningAdapter["kind"]) {
  const calls: Array<{ name: string; value: unknown }> = [];
  const adapter: EvmWalletSigningAdapter = {
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

describe("widget wallet signer contract", () => {
  beforeEach(() => {
    cdpWidgetConfig.signingEnabled = true;
    confirmAction = vi.fn(() => true);
    vi.stubGlobal("confirm", confirmAction);
  });

  afterEach(() => {
    cdpWidgetConfig.signingEnabled = originalSigningEnabled;
    vi.unstubAllGlobals();
  });

  for (const kind of ["external", "cdp_embedded"] as const) {
    it(`${kind} produces the same permit and transaction result shapes`, async () => {
      const fake = fakeAdapter(kind);
      setActiveEvmWalletSigningAdapter(fake.adapter);

      const [signed] = await signMultipleTypedData([typedData], address);
      const hash = await signAndSubmitEvmTransaction(unsignedTx);

      expect(signed?.signature).toEqual({
        deadline: 123,
        r: `0x${"11".repeat(32)}`,
        s: `0x${"11".repeat(32)}`,
        v: 27
      });
      expect(hash).toBe(confirmedHash);
      expect(fake.calls.map(call => call.name)).toEqual([
        "signTypedData",
        "sendTransaction",
        "waitForTransaction"
      ]);
      expect(fake.calls[1]?.value).toMatchObject({
        chainId: 8453,
        gas: 21000n,
        maxFeePerGas: 3000000000n,
        maxPriorityFeePerGas: 1000000000n,
        nonce: 0,
        value: 7n
      });
      expect(confirmAction).toHaveBeenCalledTimes(kind === "cdp_embedded" ? 2 : 0);
      if (kind === "cdp_embedded") {
        expect(confirmAction.mock.calls.join("\n")).toContain("PermitTransferFrom");
        expect(confirmAction.mock.calls.join("\n")).toContain('"chainId": 8453');
        expect(confirmAction.mock.calls.join("\n")).toContain('"data": "0x1234"');
      }
    });
  }

  it("blocks embedded signing when the signing kill switch is off", async () => {
    const fake = fakeAdapter("cdp_embedded");
    setActiveEvmWalletSigningAdapter(fake.adapter);
    cdpWidgetConfig.signingEnabled = false;

    await expect(signAndSubmitEvmTransaction(unsignedTx)).rejects.toThrow("signing is disabled");
    expect(fake.calls).toHaveLength(0);
    expect(confirmAction).not.toHaveBeenCalled();
  });

  it("does not sign or broadcast when the user rejects the embedded-wallet review", async () => {
    const fake = fakeAdapter("cdp_embedded");
    setActiveEvmWalletSigningAdapter(fake.adapter);
    confirmAction.mockReturnValue(false);

    await expect(signMultipleTypedData([typedData], address)).rejects.toThrow("action was cancelled");
    await expect(signAndSubmitEvmTransaction(unsignedTx)).rejects.toThrow("action was cancelled");
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects a transaction for a different signer before broadcasting", async () => {
    const fake = fakeAdapter("cdp_embedded");
    setActiveEvmWalletSigningAdapter(fake.adapter);

    await expect(
      signAndSubmitEvmTransaction({
        ...unsignedTx,
        signer: "0x2222222222222222222222222222222222222222"
      })
    ).rejects.toThrow("does not match the server-issued transaction signer");
    expect(fake.calls).toHaveLength(0);
  });

  it("rejects typed data for a different signer before requesting a signature", async () => {
    const fake = fakeAdapter("cdp_embedded");
    setActiveEvmWalletSigningAdapter(fake.adapter);

    await expect(
      signMultipleTypedData([typedData], "0x2222222222222222222222222222222222222222")
    ).rejects.toThrow("does not match the server-issued typed-data signer");
    expect(fake.calls).toHaveLength(0);
  });
});
