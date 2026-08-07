import { describe, expect, it } from "bun:test";
import { Networks } from "@vortexfi/shared";
import { privateKeyToAccount } from "viem/accounts";
import { ETHEREUM_EPHEMERAL_STARTING_BALANCE_UNITS } from "../../../../../constants/constants";
import { UnrecoverablePhaseError } from "../../../../errors/phase-error";
import { DESTINATION_EVM_FUNDING_AMOUNTS, ensurePresignedTransferFunded } from "./destination-funding";

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

describe("destination EVM funding amounts", () => {
  it("uses the static Ethereum ephemeral funding constant", () => {
    expect(DESTINATION_EVM_FUNDING_AMOUNTS[Networks.Ethereum]).toBe(ETHEREUM_EPHEMERAL_STARTING_BALANCE_UNITS);
  });
});
