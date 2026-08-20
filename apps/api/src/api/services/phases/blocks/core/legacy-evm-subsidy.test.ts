import { describe, expect, it, mock } from "bun:test";
import { encodeFunctionData, erc20Abi } from "viem";
import type FinancialOperation from "../../../../../models/financialOperation.model";
import { reconcileLegacyEvmSubsidy } from "./legacy-evm-subsidy";

const hash = "0x1111111111111111111111111111111111111111111111111111111111111111" as const;
const source = "0x1111111111111111111111111111111111111111" as const;
const destination = "0x2222222222222222222222222222222222222222" as const;
const token = "0x3333333333333333333333333333333333333333" as const;

function legacyOperation(): FinancialOperation {
  return { response: { hash } } as FinancialOperation;
}

describe("reconcileLegacyEvmSubsidy", () => {
  it("verifies and restores the exact ERC-20 amount from a confirmed legacy transaction", async () => {
    const getTransaction = mock(async () => ({
      from: source,
      input: encodeFunctionData({ abi: erc20Abi, args: [destination, 5000000n], functionName: "transfer" }),
      to: token
    }));

    await expect(
      reconcileLegacyEvmSubsidy({
        destination,
        getTransaction,
        operation: legacyOperation(),
        source,
        targetBalanceRaw: "100000000",
        token
      })
    ).resolves.toEqual({ amountRaw: "5000000", hash });
  });

  it.each([
    ["sender", "0x4444444444444444444444444444444444444444", token, destination],
    ["token", source, "0x4444444444444444444444444444444444444444", destination],
    ["recipient", source, token, "0x4444444444444444444444444444444444444444"]
  ] as const)("rejects a legacy transaction with the wrong %s", async (_field, actualSource, actualToken, recipient) => {
    const getTransaction = mock(async () => ({
      from: actualSource,
      input: encodeFunctionData({ abi: erc20Abi, args: [recipient, 5000000n], functionName: "transfer" }),
      to: actualToken
    }));

    await expect(
      reconcileLegacyEvmSubsidy({
        destination,
        getTransaction,
        operation: legacyOperation(),
        source,
        targetBalanceRaw: "100000000",
        token
      })
    ).resolves.toBeNull();
  });

  it("does not treat a newer response as a legacy schema migration", async () => {
    const operation = { response: { amountRaw: "5000000", hash } } as FinancialOperation;
    const getTransaction = mock(async () => ({
      from: source,
      input: encodeFunctionData({ abi: erc20Abi, args: [destination, 5000000n], functionName: "transfer" }),
      to: token
    }));

    await expect(
      reconcileLegacyEvmSubsidy({ destination, getTransaction, operation, source, targetBalanceRaw: "100000000", token })
    ).resolves.toBeNull();
    expect(getTransaction).not.toHaveBeenCalled();
  });
});
