import { afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import { type CleanupPhase, EvmClientManager, Networks, type PresignedTx } from "@vortexfi/shared";
import { encodeFunctionData, erc20Abi } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import type RampState from "../../../../models/rampState.model";
import { getEvmFundingAccount } from "../blocks/core/evm-funding";
import { ROBINHOOD_STOCKS } from "../blocks/core/robinhood-stocks";
import { BaseChainPostProcessHandler } from "./base-chain-post-process-handler";
import { postProcessHandlers } from "./index";
import { RobinhoodPostProcessHandler } from "./robinhood-post-process-handler";

const ephemeral = privateKeyToAccount("0xabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcdefabcd");
const funding = getEvmFundingAccount(Networks.Robinhood).address;
const STOCK = ROBINHOOD_STOCKS.NVDA.address;
const SURPLUS = 123_456n;
const HASH = `0x${"ab".repeat(32)}`;

afterEach(() => mock.restore());

async function presigned(phase: CleanupPhase, network: Networks, chainId: number): Promise<PresignedTx> {
  return {
    meta: {},
    network,
    nonce: 3,
    phase,
    signer: ephemeral.address,
    txData: await ephemeral.signTransaction({
      chainId,
      data: encodeFunctionData({ abi: erc20Abi, args: [funding, 2n ** 256n - 1n], functionName: "approve" }),
      gas: 100_000n,
      maxFeePerGas: 30_000_000n,
      maxPriorityFeePerGas: 0n,
      nonce: 3,
      to: STOCK,
      type: "eip1559"
    })
  };
}

function ramp(presignedTxs: PresignedTx[], currentPhase = "complete") {
  return {
    currentPhase,
    id: "ramp-1",
    presignedTxs,
    state: { evmEphemeralAddress: ephemeral.address }
  } as unknown as RampState;
}

function installChain(balance: bigint, receiptStatus: "success" | "reverted" = "success") {
  const calls = {
    getClient: [] as string[],
    readContract: [] as unknown[],
    sendRaw: [] as Array<[string, string]>,
    wallet: [] as string[],
    writeContract: [] as Array<{ args: readonly unknown[]; functionName: string }>
  };
  spyOn(EvmClientManager, "getInstance").mockReturnValue({
    getClient: (network: string) => {
      calls.getClient.push(network);
      return {
        readContract: async (params: unknown) => {
          calls.readContract.push(params);
          return balance;
        },
        waitForTransactionReceipt: async () => ({ status: receiptStatus })
      };
    },
    getWalletClient: (network: string) => {
      calls.wallet.push(network);
      return {
        writeContract: async (params: { args: readonly unknown[]; functionName: string }) => {
          calls.writeContract.push(params);
          return HASH;
        }
      };
    },
    sendRawTransactionWithRetry: async (network: string, raw: string) => {
      calls.sendRaw.push([network, raw]);
      return HASH;
    }
  } as never);
  return calls;
}

describe("RobinhoodPostProcessHandler", () => {
  const handler = new RobinhoodPostProcessHandler();

  it("is one of the registered cleanup handlers", () => {
    expect(postProcessHandlers.some(value => value.getCleanupName() === "robinhoodCleanupStock")).toBe(true);
  });

  it("only takes completed ramps that presigned the stock cleanup", async () => {
    const approval = await presigned("robinhoodCleanupStock", Networks.Robinhood, 4663);

    expect(handler.shouldProcess(ramp([approval]))).toBe(true);
    expect(handler.shouldProcess(ramp([approval], "destinationTransfer"))).toBe(false);
    expect(handler.shouldProcess(ramp([await presigned("baseCleanupUsdc", Networks.Base, 8453)]))).toBe(false);
  });

  it("sweeps the surplus on Robinhood Chain: approve, then the funding wallet pulls the exact balance", async () => {
    const approval = await presigned("robinhoodCleanupStock", Networks.Robinhood, 4663);
    const calls = installChain(SURPLUS);

    expect(await handler.process(ramp([approval]))).toEqual([true, null]);

    expect(new Set(calls.getClient)).toEqual(new Set([Networks.Robinhood]));
    expect(calls.sendRaw).toEqual([[Networks.Robinhood, approval.txData as string]]);
    expect(calls.wallet).toEqual([Networks.Robinhood]);
    expect(calls.writeContract).toEqual([
      expect.objectContaining({ address: STOCK, args: [ephemeral.address, funding, SURPLUS], functionName: "transferFrom" })
    ]);
  });

  it("broadcasts nothing without a surplus", async () => {
    const calls = installChain(0n);

    expect(await handler.process(ramp([await presigned("robinhoodCleanupStock", Networks.Robinhood, 4663)]))).toEqual([true, null]);

    expect(calls.sendRaw).toEqual([]);
    expect(calls.writeContract).toEqual([]);
  });

  it("reports a reverted approval under its own name, for the worker to retry", async () => {
    installChain(SURPLUS, "reverted");

    const [ok, error] = await handler.process(ramp([await presigned("robinhoodCleanupStock", Networks.Robinhood, 4663)]));

    expect(ok).toBe(false);
    expect(error?.message).toContain("robinhoodCleanupStock");
    expect(handler.getCleanupName()).toBe("robinhoodCleanupStock");
  });
});

describe("BaseChainPostProcessHandler after the generalization", () => {
  const handler = new BaseChainPostProcessHandler();

  it("still sweeps Base only, and ignores the stock cleanup", async () => {
    const approval = await presigned("baseCleanupUsdc", Networks.Base, 8453);
    const stockApproval = await presigned("robinhoodCleanupStock", Networks.Robinhood, 4663);
    const calls = installChain(SURPLUS);

    expect(handler.getCleanupName()).toBe("baseCleanupBrla");
    expect(handler.shouldProcess(ramp([stockApproval]))).toBe(false);
    expect(await handler.process(ramp([approval, stockApproval]))).toEqual([true, null]);

    expect(new Set(calls.getClient)).toEqual(new Set([Networks.Base]));
    expect(calls.sendRaw).toEqual([[Networks.Base, approval.txData as string]]);
    expect(calls.wallet).toEqual([Networks.Base]);
  });
});
