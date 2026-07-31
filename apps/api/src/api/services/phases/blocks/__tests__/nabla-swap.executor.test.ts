import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { parseTransaction } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import * as financialOperationNamespace from "../core/financial-operation";

const sharedReal = { ...sharedNamespace };
const financialOperationReal = { ...financialOperationNamespace };
const account = privateKeyToAccount("0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");
const unexpectedAddress = "0x1111111111111111111111111111111111111111";
const routerAddress = "0x2222222222222222222222222222222222222222";
const swapHash = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const swapTx = await account.signTransaction({
  chainId: 8453,
  data: "0x12345678",
  gas: 500000n,
  maxFeePerGas: 2000000000n,
  maxPriorityFeePerGas: 1000000n,
  nonce: 0,
  to: routerAddress,
  type: "eip1559",
  value: 0n
});

const call = mock(async () => ({ data: "0x" }));
const sendRawTransaction = mock(async () => swapHash);
const waitForTransactionReceipt = mock(async () => ({ status: "success" }));
const checkEvmBalanceForToken = mock(async () => undefined);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({ call, sendRawTransaction, waitForTransactionReceipt })
    })
  },
  evmTokenConfig: {
    [sharedReal.Networks.Base]: {
      [sharedReal.EvmToken.USDC]: {
        assetSymbol: sharedReal.EvmToken.USDC,
        decimals: 6,
        erc20AddressSourceChain: "0x3333333333333333333333333333333333333333",
        isNative: false,
        network: sharedReal.Networks.Base
      }
    }
  }
}));
mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({ perform }: { perform(key: string): Promise<unknown> }) => perform("test-operation")
}));

const { default: QuoteTicket } = await import("../../../../../models/quoteTicket.model");
const { NablaSwapExecutor } = await import("../phases/nabla-swap/execution");
const realQuoteTicketFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
});

QuoteTicket.findByPk = mock(async () => ({
  metadata: {
    blocks: {
      nablaSwap: {
        inputAmountForSwapRaw: "1000000",
        inputCurrency: sharedReal.EvmToken.USDC,
        network: sharedReal.Networks.Base
      }
    }
  }
})) as typeof QuoteTicket.findByPk;

function makeState(evmEphemeralAddress = account.address) {
  return {
    currentPhase: "nablaSwap",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs: [
      {
        meta: {},
        network: sharedReal.Networks.Base,
        nonce: 0,
        phase: "nablaSwap",
        signer: account.address,
        txData: swapTx
      }
    ],
    quoteId: "quote-1",
    state: { evmEphemeralAddress },
    type: sharedReal.RampDirection.SELL,
    async update(updateData: Record<string, unknown>) {
      Object.assign(this, updateData);
      return this;
    }
  } as any;
}

describe("NablaSwapExecutor EVM transaction validation", () => {
  beforeEach(() => {
    call.mockClear();
    sendRawTransaction.mockClear();
    waitForTransactionReceipt.mockClear();
    checkEvmBalanceForToken.mockClear();
  });

  it("dry-runs the decoded swap before broadcasting", async () => {
    const decoded = parseTransaction(swapTx);

    await new NablaSwapExecutor().execute(makeState());

    expect(call).toHaveBeenCalledWith({
      accessList: decoded.accessList,
      account: account.address,
      blockTag: "pending",
      data: decoded.data,
      gas: decoded.gas,
      maxFeePerGas: decoded.maxFeePerGas,
      maxPriorityFeePerGas: decoded.maxPriorityFeePerGas,
      to: decoded.to,
      type: "eip1559",
      value: decoded.value
    });
    expect(sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: swapTx });
  });

  it("does not broadcast when the dry-run reverts", async () => {
    call.mockRejectedValueOnce(new Error("EXCEEDS_MAX_COVERAGE_RATIO"));
    const state = makeState();

    await expect(new NablaSwapExecutor().execute(state)).rejects.toThrow("EXCEEDS_MAX_COVERAGE_RATIO");

    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(state.errorLogs.at(-1)).toMatchObject({ recoverable: true });
  });

  it("rejects a swap signed by an unexpected sender before dry-running or broadcasting", async () => {
    const state = makeState(unexpectedAddress);
    await expect(new NablaSwapExecutor().execute(state)).rejects.toThrow("sender mismatch");

    expect(call).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(state.errorLogs.at(-1)).toMatchObject({ recoverable: false });
  });
});
