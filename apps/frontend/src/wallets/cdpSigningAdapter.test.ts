import type { SignedTypedData } from "@vortexfi/shared";
import type { Hex } from "viem";
import { describe, expect, it, vi } from "vitest";
import { createCdpSigningAdapter, type CdpSigningAdapterDependencies } from "./cdpSigningAdapter";
import type { WalletTransactionRequest } from "./signingAdapter";

vi.mock("../wagmiConfig", () => ({ wagmiConfig: {} }));
vi.mock("../helpers/safe-wallet/waitForTransactionConfirmation", () => ({
  waitForTransactionConfirmation: vi.fn()
}));

const address = "0x1111111111111111111111111111111111111111";
const destination = "0x2222222222222222222222222222222222222222";
const rawTransaction = "0x02aabb" as Hex;
const transactionHash = `0x${"ab".repeat(32)}` as Hex;
const confirmedHash = `0x${"cd".repeat(32)}` as Hex;
const signature = `0x${"11".repeat(65)}` as Hex;

function dependencies(overrides: Partial<CdpSigningAdapterDependencies> = {}): CdpSigningAdapterDependencies {
  return {
    estimateFees: async () => ({ maxFeePerGas: 30n, maxPriorityFeePerGas: 2n }),
    estimateGas: async () => 25_000n,
    getGasPrice: async () => 5n,
    getNonce: async () => 9,
    getPublicClient: () => ({ sendRawTransaction: async () => transactionHash }),
    waitForTransaction: async () => confirmedHash,
    ...overrides
  };
}

const typedData: SignedTypedData = {
  domain: {
    chainId: 8453,
    name: "Permit",
    salt: `0x${"00".repeat(32)}`,
    verifyingContract: destination,
    version: "1"
  },
  message: { owner: address, value: "7" },
  primaryType: "Permit",
  types: { Permit: [{ name: "owner", type: "address" }] }
};

describe("widget CDP signing adapter", () => {
  it("constructs the complete EIP-712 domain", async () => {
    let received: unknown;
    const adapter = createCdpSigningAdapter(
      address,
      {
        signTransaction: async () => ({ signedTransaction: rawTransaction }),
        signTypedData: async options => {
          received = options;
          return { signature };
        }
      },
      dependencies()
    );

    await expect(adapter.signTypedData(typedData)).resolves.toBe(signature);
    expect(received).toEqual({
      evmAccount: address,
      typedData: {
        domain: typedData.domain,
        message: typedData.message,
        primaryType: "Permit",
        types: {
          EIP712Domain: [
            { name: "name", type: "string" },
            { name: "version", type: "string" },
            { name: "chainId", type: "uint256" },
            { name: "verifyingContract", type: "address" },
            { name: "salt", type: "bytes32" }
          ],
          ...typedData.types
        }
      }
    });
  });

  it("forwards exact server fields, broadcasts the CDP raw transaction, and waits", async () => {
    const estimated = { fees: 0, gas: 0, nonce: 0 };
    let signOptions: unknown;
    let broadcast: unknown;
    const deps = dependencies({
      estimateFees: async () => {
        estimated.fees += 1;
        return {};
      },
      estimateGas: async () => {
        estimated.gas += 1;
        return 1n;
      },
      getNonce: async () => {
        estimated.nonce += 1;
        return 1;
      },
      getPublicClient: chainId => ({
        sendRawTransaction: async options => {
          broadcast = { chainId, ...options };
          return transactionHash;
        }
      })
    });
    const adapter = createCdpSigningAdapter(
      address,
      {
        signTransaction: async options => {
          signOptions = options;
          return { signedTransaction: rawTransaction };
        },
        signTypedData: async () => ({ signature })
      },
      deps
    );
    const request: WalletTransactionRequest = {
      chainId: 8453,
      data: "0x1234",
      gas: 21_000n,
      maxFeePerGas: 30n,
      maxPriorityFeePerGas: 2n,
      nonce: 4,
      to: destination,
      value: 7n
    };

    await expect(adapter.sendTransaction(request)).resolves.toBe(transactionHash);
    await expect(adapter.waitForTransaction(transactionHash, 8453)).resolves.toBe(confirmedHash);
    expect(estimated).toEqual({ fees: 0, gas: 0, nonce: 0 });
    expect(signOptions).toEqual({ evmAccount: address, transaction: { ...request, type: "eip1559" } });
    expect(broadcast).toEqual({ chainId: 8453, serializedTransaction: rawTransaction });
  });

  it("estimates only missing fields and applies the BSC zero-priority fallback", async () => {
    let signOptions: unknown;
    const adapter = createCdpSigningAdapter(
      address,
      {
        signTransaction: async options => {
          signOptions = options;
          return { signedTransaction: rawTransaction };
        },
        signTypedData: async () => ({ signature })
      },
      dependencies({
        estimateFees: async () => ({ maxFeePerGas: 2n, maxPriorityFeePerGas: 0n }),
        estimateGas: async () => 40_000n,
        getGasPrice: async () => 5n,
        getNonce: async () => 12
      })
    );

    await adapter.sendTransaction({ chainId: 56, data: "0xab", to: destination, value: 3n });
    expect(signOptions).toEqual({
      evmAccount: address,
      transaction: {
        chainId: 56,
        data: "0xab",
        gas: 40_000n,
        maxFeePerGas: 5n,
        maxPriorityFeePerGas: 5n,
        nonce: 12,
        to: destination,
        type: "eip1559",
        value: 3n
      }
    });
  });

  it("fails closed when fees or a chain client are unavailable", async () => {
    let signCalls = 0;
    const signingFunctions = {
      signTransaction: async () => {
        signCalls += 1;
        return { signedTransaction: rawTransaction };
      },
      signTypedData: async () => ({ signature })
    };
    const request = { chainId: 8453, data: "0x", to: destination, value: 0n } as const;
    const noFees = createCdpSigningAdapter(
      address,
      signingFunctions,
      dependencies({ estimateFees: async () => ({}) })
    );
    await expect(noFees.sendTransaction(request)).rejects.toThrow("Could not determine EIP-1559 fees");
    expect(signCalls).toBe(0);

    const noClient = createCdpSigningAdapter(
      address,
      signingFunctions,
      dependencies({ getPublicClient: () => undefined })
    );
    await expect(noClient.sendTransaction(request)).rejects.toThrow("No public client configured");
  });
});
