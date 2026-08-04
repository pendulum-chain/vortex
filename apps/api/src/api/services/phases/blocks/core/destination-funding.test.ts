import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import { UnrecoverablePhaseError } from "../../../../errors/phase-error";
import {
  calculateDestinationFundingShortfallRaw,
  DESTINATION_EVM_FUNDING_AMOUNTS,
  ensurePresignedTransferFunded
} from "./destination-funding";
import { calculatePresignedGasBudgetRaw } from "./ethereum-destination-gas";

const account = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const recipient = "0x0000000000000000000000000000000000000001";

describe("ensurePresignedTransferFunded", () => {
  it("fails unrecoverably when a server-generated transaction cannot be parsed", async () => {
    await expect(ensurePresignedTransferFunded("0xdead", Networks.Base, "testPayout")).rejects.toBeInstanceOf(
      UnrecoverablePhaseError
    );
  });

  it("fails unrecoverably for a zero-value payout instead of broadcasting it", async () => {
    const rawTx = await account.signTransaction({
      chainId: 8453,
      gas: 21_000n,
      gasPrice: 1n,
      nonce: 0,
      to: recipient,
      value: 0n
    });

    await expect(ensurePresignedTransferFunded(rawTx, Networks.Base, "testPayout")).rejects.toBeInstanceOf(
      UnrecoverablePhaseError
    );
  });
});

describe("Ethereum destination gas funding", () => {
  it("derives the funding requirement from the signed transaction fee cap", async () => {
    const rawTx = await account.signTransaction({
      chainId: 1,
      gas: 100_000n,
      maxFeePerGas: 3_000_000_000n,
      maxPriorityFeePerGas: 1_000_000_000n,
      nonce: 0,
      to: recipient,
      type: "eip1559",
      value: 0n
    });

    expect(calculatePresignedGasBudgetRaw(rawTx)).toBe(300_000_000_000_000n);
  });

  it("does not retain a static Ethereum destination funding amount", () => {
    expect(DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Ethereum]).toBeUndefined();
  });

  it("funds only the shortfall below the signed gas requirement", () => {
    expect(calculateDestinationFundingShortfallRaw(300n, 125n)).toBe(175n);
    expect(calculateDestinationFundingShortfallRaw(300n, 300n)).toBe(0n);
    expect(calculateDestinationFundingShortfallRaw(300n, 400n)).toBe(0n);
  });
});
