import { describe, expect, it } from "bun:test";
import { inspectMoneriumSelfTransferTransaction } from "./monerium-self-transfer";
import { Interface, Wallet } from "ethers";
import { ERC20_EURE_POLYGON_V2 } from "@vortexfi/shared";

const transferFromInterface = new Interface(["function transferFrom(address from,address to,uint256 value)"]);
const OWNER = new Wallet("0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa");
const SIGNER = new Wallet("0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb");
const OTHER_RECIPIENT = new Wallet("0xcccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc");
const OTHER_TOKEN = "0x1111111111111111111111111111111111111111" as const;

const expectation = {
  expectedAmountRaw: "1020000000000000000",
  expectedOwner: OWNER.address as `0x${string}`,
  expectedRecipient: SIGNER.address as `0x${string}`,
  expectedSigner: SIGNER.address as `0x${string}`,
  rampId: "ramp-1"
};

async function signSelfTransferTx({
  chainId = 137,
  data,
  gasLimit = 100000n,
  nonce = 0,
  to = ERC20_EURE_POLYGON_V2
}: {
  chainId?: number;
  data?: `0x${string}`;
  gasLimit?: bigint;
  nonce?: number | undefined;
  to?: `0x${string}`;
} = {}): Promise<string> {
  return SIGNER.signTransaction({
    chainId,
    data:
      data ??
      (transferFromInterface.encodeFunctionData("transferFrom", [
        expectation.expectedOwner,
        expectation.expectedRecipient,
        BigInt(expectation.expectedAmountRaw)
      ]) as `0x${string}`),
    gasLimit,
    maxFeePerGas: 10_000_000_000n,
    maxPriorityFeePerGas: 1_000_000_000n,
    nonce,
    to,
    type: 2,
    value: 0
  });
}

describe("inspectMoneriumSelfTransferTransaction", () => {
  it("decodes and validates a signed Monerium self-transfer", async () => {
    const rawSelfTransferTx = await signSelfTransferTx();
    const inspection = await inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, expectation);

    expect(inspection.amountRaw).toBe(1020000000000000000n);
    expect(inspection.owner.toLowerCase()).toBe(expectation.expectedOwner.toLowerCase());
    expect(inspection.recipient.toLowerCase()).toBe(expectation.expectedRecipient.toLowerCase());
    expect(inspection.signer.toLowerCase()).toBe(expectation.expectedSigner.toLowerCase());
    expect(inspection.signedGas).toBe(100000n);
    expect(inspection.signedNonce).toBe(0);
    expect(inspection.tokenAddress.toLowerCase()).toBe(ERC20_EURE_POLYGON_V2.toLowerCase());
  });

  it("rejects a signed transfer for the wrong amount", async () => {
    const rawSelfTransferTx = await signSelfTransferTx();
    await expect(
      inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
        ...expectation,
        expectedAmountRaw: "1020000000000000001"
      })
    ).rejects.toThrow("Self-transfer amount 1020000000000000000 does not match expected 1020000000000000001");
  });

  it("accepts a signed transfer when chainId matches the expected network", async () => {
    const rawSelfTransferTx = await signSelfTransferTx();
    const inspection = await inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
      ...expectation,
      expectedChainId: 137
    });

    expect(inspection.amountRaw).toBe(1020000000000000000n);
  });

  it("rejects a signed transfer when chainId does not match the expected network", async () => {
    const rawSelfTransferTx = await signSelfTransferTx();
    await expect(
      inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
        ...expectation,
        expectedChainId: 1
      })
    ).rejects.toThrow("Self-transfer chainId 137 does not match expected 1");
  });

  it("rejects a signed transfer for the wrong token contract", async () => {
    const rawSelfTransferTx = await signSelfTransferTx({ to: OTHER_TOKEN });

    await expect(
      inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, {
        ...expectation,
        expectedTokenAddress: ERC20_EURE_POLYGON_V2
      })
    ).rejects.toThrow(`Self-transfer token ${OTHER_TOKEN} does not match expected ${ERC20_EURE_POLYGON_V2}`);
  });

  it("rejects a signed transfer for the wrong recipient", async () => {
    const rawSelfTransferTx = await signSelfTransferTx({
      data: transferFromInterface.encodeFunctionData("transferFrom", [
        expectation.expectedOwner,
        OTHER_RECIPIENT.address,
        BigInt(expectation.expectedAmountRaw)
      ]) as `0x${string}`
    });

    await expect(inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, expectation)).rejects.toThrow(
      `Self-transfer recipient ${OTHER_RECIPIENT.address} does not match expected ${expectation.expectedRecipient}`
    );
  });

  it("rejects a signed transfer with invalid calldata", async () => {
    const rawSelfTransferTx = await signSelfTransferTx({ data: "0x1234" });

    await expect(inspectMoneriumSelfTransferTransaction(rawSelfTransferTx, expectation)).rejects.toThrow(
      "Self-transfer calldata is not a valid transferFrom payload"
    );
  });

  it("rejects a signed transfer without a nonce", async () => {
    await expect(
      inspectMoneriumSelfTransferTransaction("0xdeadbeef", expectation, {
        decodeFunctionData: () => ({
          args: [expectation.expectedOwner, expectation.expectedRecipient, BigInt(expectation.expectedAmountRaw)]
        }),
        parseTransaction: () =>
          ({
            chainId: 137,
            data: "0x23b872dd",
            gas: 100000n,
            nonce: undefined,
            to: ERC20_EURE_POLYGON_V2
          }) as ReturnType<typeof import("viem").parseTransaction>,
        recoverTransactionAddress: async () => expectation.expectedSigner
      })
    ).rejects.toThrow("Self-transfer signed transaction is missing a nonce");
  });
});
