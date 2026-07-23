// eslint-disable-next-line import/no-unresolved
import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
// Captured before mock.module so afterAll can restore the real package —
// bun module mocks are process-wide and would poison later test files.
import * as sharedNamespace from "@vortexfi/shared";
import * as rampServiceNamespace from "../../ramp/ramp.service";
import * as evmFundingNamespace from "../evm-funding";

// Value copies taken before mock.module runs — the namespaces themselves are
// live bindings that would reflect the mocks once installed.
const sharedReal = { ...sharedNamespace };
const rampServiceReal = { ...rampServiceNamespace };
const evmFundingReal = { ...evmFundingNamespace };

const Networks = {
  AssetHub: "assethub",
  Base: "base",
  Moonbeam: "moonbeam",
  Polygon: "polygon"
} as const;

const FiatToken = {
  BRL: "BRL",
  EURC: "EUR"
} as const;

const RampDirection = {
  BUY: "BUY",
  SELL: "SELL"
} as const;

const SWAP_HASH = "0x31365ff4337000801303097a0494fd97ecc1661ea84fedee801f01825b236f49";
const EVM_EPHEMERAL_ADDRESS = "0x1111111111111111111111111111111111111111";
const FUNDER_ADDRESS = "0x2222222222222222222222222222222222222222";

// Queue of axelarscan statuses returned per polling iteration; refilled per test.
let axelarStatusQueue: unknown[] = [];
const getStatusAxelarScan = mock(async () => {
  if (axelarStatusQueue.length > 1) {
    return axelarStatusQueue.shift();
  }
  return axelarStatusQueue[0];
});
const getStatus = mock(async () => ({
  id: "",
  isGMPTransaction: true,
  routeStatus: [],
  squidTransactionStatus: "",
  status: "ongoing"
}));
const recoverAxelarStuckConfirm = mock(async () => "AXELAR_TX_HASH");
// Never settles on its own; the real implementation rejects on abort, but these
// tests always resolve via the bridge path of Promise.any.
const checkEvmBalanceForToken = mock(() => new Promise(() => undefined));

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  checkEvmBalanceForToken,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({}),
      getWalletClient: () => ({ account: { address: FUNDER_ADDRESS } })
    })
  },
  FiatToken,
  getNetworkId: (network: string) => {
    if (network === Networks.Base) return 8453;
    if (network === Networks.Polygon) return 137;
    if (network === Networks.Moonbeam) return 1284;
    return undefined;
  },
  getOnChainTokenDetails: () => ({
    decimals: 6,
    erc20AddressSourceChain: "0x3333333333333333333333333333333333333333",
    isNative: false
  }),
  getStatus,
  getStatusAxelarScan,
  isAlfredpayToken: () => false,
  Networks,
  RampDirection,
  recoverAxelarStuckConfirm
}));

mock.module("../evm-funding", () => ({
  getEvmFundingAccount: () => ({ address: FUNDER_ADDRESS })
}));

mock.module("../../ramp/ramp.service", () => ({
  default: {
    appendErrorLog: mock(async () => undefined)
  }
}));

const { default: QuoteTicket } = await import("../../../../models/quoteTicket.model");
const { default: RampState } = await import("../../../../models/rampState.model");
const { SquidRouterPayPhaseHandler } = await import("./squid-router-pay-phase-handler");

const realQuoteTicketFindByPk = QuoteTicket.findByPk;
const realRampStateUpdate = RampState.update;

// Static conditional update used by the atomic gas top-up claim; [1] = claim won.
const rampStateUpdate = mock(async () => [1]);
RampState.update = rampStateUpdate as unknown as typeof RampState.update;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../ramp/ramp.service", () => ({ ...rampServiceReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
  RampState.update = realRampStateUpdate;
});

let quote: {
  inputCurrency: string;
  outputCurrency: string;
  to: string;
};

QuoteTicket.findByPk = mock(async () => quote as any) as typeof QuoteTicket.findByPk;

function makeState(stateOverrides: Record<string, any> = {}) {
  const state = {
    currentPhase: "squidRouterPay",
    errorLogs: [],
    get() {
      const { get: _get, update: _update, ...data } = this;
      return data;
    },
    id: "ramp-1",
    phaseHistory: [],
    quoteId: "quote-1",
    state: {
      evmEphemeralAddress: EVM_EPHEMERAL_ADDRESS,
      squidRouterPayTxHash: "0xpay",
      squidRouterSwapHash: SWAP_HASH,
      ...stateOverrides
    },
    to: Networks.Base,
    type: RampDirection.BUY,
    async update(updateData: Record<string, any>) {
      Object.assign(this, updateData);
      return this;
    }
  };
  return state as any;
}

function makeHandler() {
  const handler = new SquidRouterPayPhaseHandler();
  // Shrink the real 60s/10s waits so the polling loop runs in test time.
  (handler as any).initialDelayMs = 10;
  (handler as any).pollIntervalMs = 10;
  return handler;
}

const STUCK_CONFIRM_STATUS = {
  call: { chain: "base" },
  confirm_failed: true,
  id: `${SWAP_HASH}_55_172`,
  is_insufficient_fee: false,
  status: "called"
};

const EXECUTED_STATUS = {
  id: `${SWAP_HASH}_55_172`,
  is_insufficient_fee: false,
  status: "executed"
};

describe("SquidRouterPayPhaseHandler", () => {
  beforeEach(() => {
    axelarStatusQueue = [];
    getStatus.mockClear();
    getStatusAxelarScan.mockClear();
    recoverAxelarStuckConfirm.mockClear();
    checkEvmBalanceForToken.mockClear();
    rampStateUpdate.mockClear();
    rampStateUpdate.mockImplementation(async () => [1]);
    quote = {
      inputCurrency: FiatToken.BRL,
      outputCurrency: "USDC",
      to: Networks.Base
    };
  });

  it("recovers a stuck confirm and records the attempt timestamp", async () => {
    axelarStatusQueue = [STUCK_CONFIRM_STATUS, EXECUTED_STATUS];

    const state = makeState();
    const updatedState = await makeHandler().execute(state);

    expect(recoverAxelarStuckConfirm).toHaveBeenCalledTimes(1);
    expect(recoverAxelarStuckConfirm).toHaveBeenCalledWith(SWAP_HASH, "base", undefined);
    expect(state.state.axelarConfirmRecoveryAt).toBeString();
    expect(updatedState.currentPhase).toBe("finalSettlementSubsidy");
  });

  it("respects the cooldown and does not re-broadcast a recent recovery attempt", async () => {
    axelarStatusQueue = [STUCK_CONFIRM_STATUS, STUCK_CONFIRM_STATUS, EXECUTED_STATUS];

    const state = makeState({ axelarConfirmRecoveryAt: new Date().toISOString() });
    await makeHandler().execute(state);

    expect(recoverAxelarStuckConfirm).not.toHaveBeenCalled();
  });

  it("does not attempt recovery while the confirm poll has not failed", async () => {
    axelarStatusQueue = [
      { ...STUCK_CONFIRM_STATUS, confirm_failed: false },
      EXECUTED_STATUS
    ];

    const state = makeState();
    await makeHandler().execute(state);

    expect(recoverAxelarStuckConfirm).not.toHaveBeenCalled();
  });

  describe("stuck-GMP monitoring", () => {
    const CALLED_STATUS = {
      call: { chain: "base" },
      id: `${SWAP_HASH}_55_172`,
      is_insufficient_fee: false,
      status: "called"
    };

    const INSUFFICIENT_GAS_STATUS = {
      ...CALLED_STATUS,
      fees: {
        execute_gas_multiplier: 1.1,
        source_base_fee: 0.01,
        source_token: { gas_price: "0.00000002", gas_price_in_units: { decimals: 18, value: "20000000000" } }
      },
      is_insufficient_fee: true
    };

    function makeStuckHandler() {
      const handler = makeHandler();
      (handler as any).stuckAlertThresholdMs = 0;
      const sendMessage = mock(async () => undefined);
      (handler as any).slackNotifier = { sendMessage };
      return { handler, sendMessage };
    }

    it("alerts once with classification and context when stuck past the threshold", async () => {
      axelarStatusQueue = [CALLED_STATUS, EXECUTED_STATUS];

      // Uses the real 20-minute default threshold; elapsed time comes from phaseHistory.
      const handler = makeHandler();
      const sendMessage = mock(async () => undefined);
      (handler as any).slackNotifier = { sendMessage };

      const state = makeState({ squidRouterQuoteId: "squid-quote-1" });
      state.phaseHistory = [{ phase: "squidRouterPay", timestamp: new Date(Date.now() - 30 * 60 * 1000) }];
      state.errorLogs = [
        { error: "Bridge status check timed out after 480000ms", phase: "squidRouterPay", timestamp: new Date().toISOString() }
      ];

      await handler.execute(state);

      expect(sendMessage).toHaveBeenCalledTimes(1);
      const text = (sendMessage.mock.calls[0] as any)[0].text as string;
      expect(text).toContain("stuck for 30 minutes");
      expect(text).toContain("ramp-1");
      expect(text).toContain("classification: waiting_source_confirmation");
      expect(text).toContain(SWAP_HASH);
      expect(text).toContain("squid-quote-1");
      expect(text).toContain(`https://axelarscan.io/gmp/${SWAP_HASH}`);
      expect(text).toContain("Bridge status check timed out after 480000ms");
      expect(state.state.squidRouterStuckAlertedAt).toBeString();
    });

    it("attempts confirm recovery for a transfer stuck at called even without confirm_failed", async () => {
      axelarStatusQueue = [CALLED_STATUS, EXECUTED_STATUS];

      const { handler } = makeStuckHandler();
      await handler.execute(makeState());

      expect(recoverAxelarStuckConfirm).toHaveBeenCalledTimes(1);
      expect(recoverAxelarStuckConfirm).toHaveBeenCalledWith(SWAP_HASH, "base", undefined);
    });

    it("does not re-alert within the repeat window", async () => {
      axelarStatusQueue = [CALLED_STATUS, EXECUTED_STATUS];

      const { handler, sendMessage } = makeStuckHandler();
      await handler.execute(makeState({ squidRouterStuckAlertedAt: new Date().toISOString() }));

      expect(sendMessage).not.toHaveBeenCalled();
    });

    it("does not alert or recover before the threshold", async () => {
      axelarStatusQueue = [CALLED_STATUS, EXECUTED_STATUS];

      const handler = makeHandler(); // default 20-minute threshold, phase just started
      const sendMessage = mock(async () => undefined);
      (handler as any).slackNotifier = { sendMessage };
      await handler.execute(makeState());

      expect(sendMessage).not.toHaveBeenCalled();
      expect(recoverAxelarStuckConfirm).not.toHaveBeenCalled();
    });

    it("sends exactly one supplemental gas top-up when Axelar reports insufficient gas after payment", async () => {
      axelarStatusQueue = [INSUFFICIENT_GAS_STATUS, INSUFFICIENT_GAS_STATUS, EXECUTED_STATUS];

      const { handler, sendMessage } = makeStuckHandler();
      const executeFundTransaction = mock(async () => "0xtopup");
      (handler as any).executeFundTransaction = executeFundTransaction;

      const state = makeState(); // squidRouterPayTxHash "0xpay" already set
      await handler.execute(state);

      expect(executeFundTransaction).toHaveBeenCalledTimes(1);
      expect(state.state.squidRouterExtraGasTxHash).toBe("0xtopup");
      const text = (sendMessage.mock.calls[0] as any)[0].text as string;
      expect(text).toContain("classification: insufficient_gas");
      expect(text).toContain("0xtopup");
    });

    it("does not send when a concurrent execution already claimed the top-up", async () => {
      axelarStatusQueue = [INSUFFICIENT_GAS_STATUS, EXECUTED_STATUS];
      // Conditional claim loses: another execution flipped the marker first.
      rampStateUpdate.mockImplementationOnce(async () => [0]);

      const { handler, sendMessage } = makeStuckHandler();
      const executeFundTransaction = mock(async () => "0xtopup");
      (handler as any).executeFundTransaction = executeFundTransaction;

      const state = makeState();
      await handler.execute(state);

      expect(executeFundTransaction).not.toHaveBeenCalled();
      expect(state.state.squidRouterExtraGasTxHash).toBeUndefined();
      const text = (sendMessage.mock.calls[0] as any)[0].text as string;
      expect(text).toContain("already claimed by a concurrent execution");
    });

    it("reports the real recovery outcome instead of a generic attempted message", async () => {
      axelarStatusQueue = [CALLED_STATUS, EXECUTED_STATUS];

      const { handler, sendMessage } = makeStuckHandler();
      // Cooldown active: the alert must say so rather than claim an attempt was made.
      await handler.execute(makeState({ axelarConfirmRecoveryAt: new Date().toISOString(), squidRouterStuckAlertedAt: undefined }));

      expect(recoverAxelarStuckConfirm).not.toHaveBeenCalled();
      const text = (sendMessage.mock.calls[0] as any)[0].text as string;
      expect(text).toContain("confirm recovery on cooldown");
    });

    it("never retries a top-up whose outcome is unknown (pending marker)", async () => {
      axelarStatusQueue = [INSUFFICIENT_GAS_STATUS, EXECUTED_STATUS];

      const { handler } = makeStuckHandler();
      const executeFundTransaction = mock(async () => "0xtopup");
      (handler as any).executeFundTransaction = executeFundTransaction;

      const state = makeState({ squidRouterExtraGasTxHash: "pending" });
      await handler.execute(state);

      expect(executeFundTransaction).not.toHaveBeenCalled();
      expect(state.state.squidRouterExtraGasTxHash).toBe("pending");
    });

    it("leaves the pending marker in place when the top-up broadcast fails", async () => {
      axelarStatusQueue = [INSUFFICIENT_GAS_STATUS, INSUFFICIENT_GAS_STATUS, EXECUTED_STATUS];

      const { handler } = makeStuckHandler();
      const executeFundTransaction = mock(async () => {
        throw new Error("rpc rejected");
      });
      (handler as any).executeFundTransaction = executeFundTransaction;

      const state = makeState();
      await handler.execute(state);

      // The failed attempt persists "pending" first; the second insufficient-gas
      // iteration must not send again.
      expect(executeFundTransaction).toHaveBeenCalledTimes(1);
      expect(state.state.squidRouterExtraGasTxHash).toBe("pending");
    });

    it("does not top up in the same iteration as the initial gas funding", async () => {
      axelarStatusQueue = [INSUFFICIENT_GAS_STATUS, EXECUTED_STATUS];

      const { handler } = makeStuckHandler();
      const executeFundTransaction = mock(async () => "0xinitialpay");
      (handler as any).executeFundTransaction = executeFundTransaction;

      const state = makeState({ squidRouterPayTxHash: undefined });
      await handler.execute(state);

      // Only the regular initial funding ran; the stale pre-payment status must not
      // additionally trigger a top-up.
      expect(executeFundTransaction).toHaveBeenCalledTimes(1);
      expect(state.state.squidRouterPayTxHash).toBe("0xinitialpay");
      expect(state.state.squidRouterExtraGasTxHash).toBeUndefined();
    });

    it("alerts with unknown classification when the status APIs are down", async () => {
      getStatus.mockImplementationOnce(() => Promise.reject(new Error("squid down")));
      getStatusAxelarScan.mockImplementationOnce(() => Promise.reject(new Error("axelarscan down")));
      // Non-EVM destination: bridge-status-only path, so the status failure rejects the
      // execution instead of losing the Promise.any race to a pending balance check.
      quote = { inputCurrency: FiatToken.EURC, outputCurrency: "USDC", to: Networks.AssetHub };

      const { handler, sendMessage } = makeStuckHandler();
      const state = makeState();

      await expect(handler.execute(state)).rejects.toThrow("Failed to check bridge status");

      expect(sendMessage).toHaveBeenCalledTimes(1);
      const text = (sendMessage.mock.calls[0] as any)[0].text as string;
      expect(text).toContain("classification: unknown");
      expect(text).toContain("axelar status: unavailable");
    });
  });

  it("stops polling when the processor aborts the execution", async () => {
    // Regression test for the retry storm: abandoned executions must unwind on abort
    // instead of polling the status APIs forever.
    axelarStatusQueue = [STUCK_CONFIRM_STATUS];
    quote = {
      inputCurrency: FiatToken.EURC,
      outputCurrency: "USDC",
      to: Networks.AssetHub
    };

    const abortController = new AbortController();
    const state = makeState({ axelarConfirmRecoveryAt: new Date().toISOString() });

    const execution = makeHandler().execute(state, abortController.signal);
    // Let the loop run a few iterations before aborting.
    await new Promise(resolve => setTimeout(resolve, 100));
    abortController.abort(new Error("Phase execution timed out"));

    await expect(execution).rejects.toThrow();
    expect(getStatus.mock.calls.length).toBeGreaterThan(0);

    const callsAtAbort = getStatus.mock.calls.length;
    await new Promise(resolve => setTimeout(resolve, 150));
    expect(getStatus.mock.calls.length).toBe(callsAtAbort);
  });
});
