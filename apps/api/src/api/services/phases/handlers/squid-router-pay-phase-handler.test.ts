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
const { SquidRouterPayPhaseHandler } = await import("./squid-router-pay-phase-handler");

const realQuoteTicketFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../evm-funding", () => ({ ...evmFundingReal }));
  mock.module("../../ramp/ramp.service", () => ({ ...rampServiceReal }));
  QuoteTicket.findByPk = realQuoteTicketFindByPk;
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
    expect(recoverAxelarStuckConfirm).toHaveBeenCalledWith(SWAP_HASH, "base");
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
