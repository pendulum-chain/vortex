// eslint-disable-next-line import/no-unresolved
import {afterAll, beforeEach, describe, expect, it, mock} from "bun:test";
import {privateKeyToAccount} from "viem/accounts";
import {parseTransaction} from "viem";
// Captured before mock.module so afterAll can restore the real package —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import * as rampServiceNamespace from "../../ramp/ramp.service";

// Value copies taken before mock.module runs — the namespaces themselves are
// live bindings that would reflect the mocks once installed.
const sharedReal = { ...sharedNamespace };
const rampServiceReal = { ...rampServiceNamespace };

const Networks = {
  Base: "base"
} as const;

const RampDirection = {
  SELL: "SELL"
} as const;

const EvmToken = {
  USDC: "USDC"
} as const;

const EVM_EPHEMERAL_ACCOUNT = privateKeyToAccount(
  "0x0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"
);
const UNEXPECTED_EVM_EPHEMERAL_ADDRESS = "0x1111111111111111111111111111111111111111";
const NABLA_ROUTER_ADDRESS = "0x2222222222222222222222222222222222222222";
const SWAP_TX_HASH = "0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const SWAP_TX = await EVM_EPHEMERAL_ACCOUNT.signTransaction({
  chainId: 8453,
  data: "0x12345678",
  gas: 500000n,
  maxFeePerGas: 2000000000n,
  maxPriorityFeePerGas: 1000000n,
  nonce: 0,
  to: NABLA_ROUTER_ADDRESS,
  type: "eip1559",
  value: 0n
});

const call = mock(async () => ({ data: "0x" }));
const sendRawTransaction = mock(async () => SWAP_TX_HASH);
const waitForTransactionReceipt = mock(async () => ({ status: "success" }));
const checkEvmBalanceForToken = mock(async () => undefined);
const appendErrorLog = mock(async (_rampId: string, _errorLog: { error: string; recoverable: boolean }) => undefined);

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  ApiManager: {
    getInstance: () => ({})
  },
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        call,
        sendRawTransaction,
        waitForTransactionReceipt
      })
    })
  },
  evmTokenConfig: {
    [Networks.Base]: {
      [EvmToken.USDC]: {
        assetSymbol: EvmToken.USDC,
        decimals: 6,
        erc20AddressSourceChain: "0x3333333333333333333333333333333333333333",
        isNative: false,
        network: Networks.Base
      }
    }
  },
  NABLA_ROUTER: "0x4444444444444444444444444444444444444444"
}));

mock.module("../../ramp/ramp.service", () => ({
  default: {
    appendErrorLog
  }
}));

const { default: QuoteTicket } = await import("../../../../models/quoteTicket.model");
const { NablaSwapPhaseHandler } = await import("./nabla-swap-handler");

type NablaSwapState = Parameters<InstanceType<typeof NablaSwapPhaseHandler>["execute"]>[0];

const realQuoteTicketFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../../ramp/ramp.service", () => ({ ...rampServiceReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
});

QuoteTicket.findByPk = mock(async () => ({
  metadata: {
    nablaSwapEvm: {
      inputAmountForSwapRaw: "1000000",
      inputCurrency: EvmToken.USDC
    }
  }
})) as typeof QuoteTicket.findByPk;

function makeState(overrides: Record<string, unknown> = {}) {
  const state = {
    currentPhase: "nablaSwap",
    errorLogs: [],
    get() {
      const { get: _get, update: _update, ...data } = this;
      return data;
    },
    id: "ramp-1",
    phaseHistory: [],
    presignedTxs: [
      {
        meta: {},
        network: Networks.Base,
        nonce: 0,
        phase: "nablaSwap",
        signer: EVM_EPHEMERAL_ACCOUNT.address,
        txData: SWAP_TX
      }
    ],
    quoteId: "quote-1",
    state: {
      evmEphemeralAddress: EVM_EPHEMERAL_ACCOUNT.address
    },
    type: RampDirection.SELL,
    async update(updateData: Record<string, unknown>) {
      Object.assign(this, updateData);
      return this;
    },
    ...overrides
  };

  return state as unknown as NablaSwapState;
}

describe("NablaSwapPhaseHandler", () => {
  beforeEach(() => {
    call.mockClear();
    sendRawTransaction.mockClear();
    waitForTransactionReceipt.mockClear();
    checkEvmBalanceForToken.mockClear();
    appendErrorLog.mockClear();
  });

  it("dry-runs the decoded EVM swap transaction before broadcasting", async () => {
    const decodedSwapTx = parseTransaction(SWAP_TX);
    const handler = new NablaSwapPhaseHandler();
    const updatedState = await handler.execute(makeState());

    expect(call).toHaveBeenCalledTimes(1);
    expect(call).toHaveBeenCalledWith({
      accessList: decodedSwapTx.accessList,
      account: EVM_EPHEMERAL_ACCOUNT.address,
      blockTag: "pending",
      data: decodedSwapTx.data,
      gas: decodedSwapTx.gas,
      maxFeePerGas: decodedSwapTx.maxFeePerGas,
      maxPriorityFeePerGas: decodedSwapTx.maxPriorityFeePerGas,
      to: decodedSwapTx.to,
      type: "eip1559",
      value: decodedSwapTx.value
    });
    expect(sendRawTransaction).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction).toHaveBeenCalledWith({ serializedTransaction: SWAP_TX });
    // The handler no longer transitions explicitly; the PhaseProcessor advances via phaseFlow.
    expect(updatedState.currentPhase).toBe("nablaSwap");
  });

  it("does not broadcast when the EVM swap dry-run reverts", async () => {
    call.mockRejectedValueOnce(new Error("SP:quoteSwapInto:EXCEEDS_MAX_COVERAGE_RATIO"));

    const handler = new NablaSwapPhaseHandler();

    await expect(handler.execute(makeState())).rejects.toThrow("SP:quoteSwapInto:EXCEEDS_MAX_COVERAGE_RATIO");

    expect(call).toHaveBeenCalledTimes(1);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(appendErrorLog).toHaveBeenCalledTimes(1);
    expect(appendErrorLog.mock.calls[0][1].error).toContain("SP:quoteSwapInto:EXCEEDS_MAX_COVERAGE_RATIO");
    expect(appendErrorLog.mock.calls[0][1].recoverable).toBe(true);
  });

  it("rejects EVM swap transactions signed by an unexpected sender", async () => {
    const handler = new NablaSwapPhaseHandler();

    await expect(
      handler.execute(
        makeState({
          state: {
            evmEphemeralAddress: UNEXPECTED_EVM_EPHEMERAL_ADDRESS
          }
        })
      )
    ).rejects.toThrow("EVM swap transaction sender mismatch");

    expect(call).not.toHaveBeenCalled();
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(appendErrorLog).toHaveBeenCalledTimes(1);
    expect(appendErrorLog.mock.calls[0][1].recoverable).toBe(false);
  });
});
