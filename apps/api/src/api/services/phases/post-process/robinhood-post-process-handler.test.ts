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

const USDC = "0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913";
const BRLA = "0xfCB34c47f850f452C15EA1B84d51231C38A61783";

async function presigned(phase: CleanupPhase, network: Networks, chainId: number, nonce = 3, token = STOCK): Promise<PresignedTx> {
  return {
    meta: {},
    network,
    nonce,
    phase,
    signer: ephemeral.address,
    txData: await ephemeral.signTransaction({
      chainId,
      data: encodeFunctionData({ abi: erc20Abi, args: [funding, 2n ** 256n - 1n], functionName: "approve" }),
      gas: 100_000n,
      maxFeePerGas: 30_000_000n,
      maxPriorityFeePerGas: 0n,
      nonce,
      to: token as `0x${string}`,
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

/** `balance` is every token's balance, or one per token address. The ephemeral's nonce advances with each approval sent. */
function installChain(
  balance: bigint | Record<string, bigint>,
  receiptStatus: "success" | "reverted" = "success",
  ephemeralNonce = 3
) {
  let liveNonce = ephemeralNonce;
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
        getTransactionCount: async () => liveNonce,
        readContract: async (params: { address: string }) => {
          calls.readContract.push(params);
          return typeof balance === "bigint" ? balance : (balance[params.address] ?? 0n);
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
      liveNonce += 1;
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

describe("BaseChainPostProcessHandler with several presigned approvals", () => {
  const handler = new BaseChainPostProcessHandler();
  const pulled = (calls: ReturnType<typeof installChain>) =>
    calls.writeContract.map(call => [(call as unknown as { address: string }).address, call.args[2]]);

  it("sends the approval of an empty token, so the token signed after it can still be swept", async () => {
    // The approvals occupy consecutive nonces. Skipping the first would leave the second unminable for good.
    const brla = await presigned("baseCleanupBrla", Networks.Base, 8453, 5, BRLA);
    const usdc = await presigned("baseCleanupUsdc", Networks.Base, 8453, 6, USDC);
    const calls = installChain({ [USDC]: SURPLUS }, "success", 5);

    expect(await handler.process(ramp([brla, usdc]))).toEqual([true, null]);

    expect(calls.sendRaw).toEqual([
      [Networks.Base, brla.txData as string],
      [Networks.Base, usdc.txData as string]
    ]);
    expect(pulled(calls)).toEqual([[USDC, SURPLUS]]);
  });

  it("sends nothing for the empty tokens signed after the last one with a balance", async () => {
    const usdc = await presigned("baseCleanupUsdc", Networks.Base, 8453, 5, USDC);
    const brla = await presigned("baseCleanupBrla", Networks.Base, 8453, 6, BRLA);
    const calls = installChain({ [USDC]: SURPLUS }, "success", 5);

    expect(await handler.process(ramp([usdc, brla]))).toEqual([true, null]);

    expect(calls.sendRaw).toEqual([[Networks.Base, usdc.txData as string]]);
    expect(pulled(calls)).toEqual([[USDC, SURPLUS]]);
  });

  it("follows the signed nonces, not the order of its own phase list", async () => {
    const usdc = await presigned("baseCleanupUsdc", Networks.Base, 8453, 5, USDC);
    const brla = await presigned("baseCleanupBrla", Networks.Base, 8453, 6, BRLA);
    const calls = installChain(SURPLUS, "success", 5);

    expect(await handler.process(ramp([brla, usdc]))).toEqual([true, null]);

    expect(calls.sendRaw.map(([, raw]) => raw)).toEqual([usdc.txData as string, brla.txData as string]);
    expect(pulled(calls)).toEqual([
      [USDC, SURPLUS],
      [BRLA, SURPLUS]
    ]);
  });

  it("pulls without sending the approval again when an earlier run already mined it", async () => {
    const usdc = await presigned("baseCleanupUsdc", Networks.Base, 8453, 5, USDC);
    const calls = installChain(SURPLUS, "success", 6);

    expect(await handler.process(ramp([usdc]))).toEqual([true, null]);

    expect(calls.sendRaw).toEqual([]);
    expect(pulled(calls)).toEqual([[USDC, SURPLUS]]);
  });

  it("reports an approval signed ahead of the ephemeral's nonce instead of sending it", async () => {
    const usdc = await presigned("baseCleanupUsdc", Networks.Base, 8453, 5, USDC);
    const calls = installChain(SURPLUS, "success", 4);

    const [ok, error] = await handler.process(ramp([usdc]));

    expect(ok).toBe(false);
    expect(error?.message).toContain("signed for nonce 5, but the ephemeral is at 4");
    expect(calls.sendRaw).toEqual([]);
    expect(calls.writeContract).toEqual([]);
  });
});
