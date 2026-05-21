import { describe, expect, it } from "bun:test";
import { inspectMoneriumSelfTransferTransaction } from "./monerium-self-transfer";

const rawSelfTransferTx =
  "0x02f8d381898085e64020937685e640209376830186a094e0aea583266584dafbb3f9c3211d5588c73fea8d80b86423b872dd000000000000000000000000976ff31a56daf5a0e09f411950311f5877ff00d50000000000000000000000007c4e657eeb8ba8bbf0882c817a7a9f2df55636ad0000000000000000000000000000000000000000000000000e27c49886e60000c001a029c840d52a6634e2ed642d50c306f08a379f8466a10c332e07f03bc85da1ae52a00ae865be836a16b25bbe9d647085930d4b0b1cedf3d3e84e127e14f7dddf660e";

const expectation = {
  expectedAmountRaw: "1020000000000000000",
  expectedOwner: "0x976fF31a56dAF5A0E09F411950311F5877ff00D5" as const,
  expectedRecipient: "0x7c4E657EEb8bA8bBF0882C817A7A9f2Df55636AD" as const,
  expectedSigner: "0x7c4E657EEb8bA8bBF0882C817A7A9f2Df55636AD" as const,
  rampId: "ramp-1"
};

describe("inspectMoneriumSelfTransferTransaction", () => {
  it("decodes and validates a signed Monerium self-transfer", async () => {
    const inspection = await inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, expectation);

    expect(inspection.amountRaw).toBe(1020000000000000000n);
    expect(inspection.owner.toLowerCase()).toBe(expectation.expectedOwner.toLowerCase());
    expect(inspection.recipient.toLowerCase()).toBe(expectation.expectedRecipient.toLowerCase());
    expect(inspection.signer.toLowerCase()).toBe(expectation.expectedSigner.toLowerCase());
    expect(inspection.signedGas).toBe(100000n);
    expect(inspection.signedNonce).toBe(0);
    expect(inspection.tokenAddress.toLowerCase()).toBe("0xe0aea583266584dafbb3f9c3211d5588c73fea8d");
  });

  it("rejects a signed transfer for the wrong amount", async () => {
    await expect(
      inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
        ...expectation,
        expectedAmountRaw: "1020000000000000001"
      })
    ).rejects.toThrow("Self-transfer amount 1020000000000000000 does not match expected 1020000000000000001");
  });

  it("accepts a signed transfer when chainId matches the expected network", async () => {
    const inspection = await inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
      ...expectation,
      expectedChainId: 137
    });

    expect(inspection.amountRaw).toBe(1020000000000000000n);
  });

  it("rejects a signed transfer when chainId does not match the expected network", async () => {
    await expect(
      inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
        ...expectation,
        expectedChainId: 1
      })
    ).rejects.toThrow("Self-transfer chainId 137 does not match expected 1");
  });
});
