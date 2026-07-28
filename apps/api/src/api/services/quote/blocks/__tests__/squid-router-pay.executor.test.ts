import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { Networks } from "@vortexfi/shared";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";

const sharedReal = { ...sharedNamespace };
const SWAP_HASH = "0x31365ff4337000801303097a0494fd97ecc1661ea84fedee801f01825b236f49";
const getStatus = mock(async (..._args: unknown[]) => ({
  id: "",
  isGMPTransaction: true,
  routeStatus: [],
  squidTransactionStatus: "",
  status: "ongoing"
}));
const getStatusAxelarScan = mock(async (..._args: unknown[]) => undefined as unknown);
const recoverAxelarStuckConfirm = mock(async (..._args: unknown[]) => "AXELAR_RECOVERY_HASH");
const estimateFeesPerGas = mock(async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 3n }));
const sendTransaction = mock(async (_transaction: Record<string, unknown>) => "0xgasfunding" as `0x${string}`);
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({ chain: {}, estimateFeesPerGas }),
      getWalletClient: () => ({ account: fundingAccount, sendTransaction })
    })
  },
  getStatus,
  getStatusAxelarScan,
  recoverAxelarStuckConfirm
}));

// Avoid loading the concurrently edited phase processor through BasePhaseHandler's
// error-logging dependency; these tests call executor internals and never log errors.
mock.module("../../../ramp/ramp.service", () => ({
  default: { appendErrorLog: mock(async () => undefined) }
}));

const { SquidRouterPayExecutor } = await import("../phases/squid-router-swap/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
});

beforeEach(() => {
  getStatus.mockClear();
  getStatusAxelarScan.mockClear();
  recoverAxelarStuckConfirm.mockClear();
  estimateFeesPerGas.mockClear();
  sendTransaction.mockClear();
  getStatus.mockImplementation(async () => ({
    id: "",
    isGMPTransaction: true,
    routeStatus: [],
    squidTransactionStatus: "",
    status: "ongoing"
  }));
  getStatusAxelarScan.mockImplementation(async () => undefined as unknown);
});

function makeQuote(fromNetwork: Networks = Networks.Arbitrum) {
  return {
    metadata: {
      blocks: {
        squidRouterSwap: {
          fromNetwork,
          fromToken: "0x1111111111111111111111111111111111111111",
          inputAmountRaw: "1000000",
          toNetwork: Networks.Base,
          toToken: "0x2222222222222222222222222222222222222222"
        }
      }
    },
    outputCurrency: "USDC",
    to: Networks.Base
  } as unknown as QuoteTicket;
}

function makeState(stateOverrides: Record<string, unknown> = {}) {
  return {
    errorLogs: [],
    id: "block-ramp-1",
    phaseHistory: [],
    state: {
      blockState: { squidRouterSwap: { quoteId: "block-squid-quote" } },
      squidRouterPayTxHash: "0xinitialpay",
      squidRouterSwapHash: SWAP_HASH,
      ...stateOverrides
    }
  } as unknown as RampState;
}

const FEE_STATUS = {
  call: { chain: "arbitrum" },
  fees: {
    execute_gas_multiplier: 1.1,
    source_base_fee: 0.01,
    source_token: { gas_price: "0.00000002", gas_price_in_units: { decimals: 18, value: "20000000000" } }
  },
  id: `${SWAP_HASH}_55_172`,
  is_insufficient_fee: true,
  status: "called"
};

describe("SquidRouterPayExecutor reliability", () => {
  it("fails recoverably when the configured bridge polling deadline expires", async () => {
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.initialDelayMs = 0;

    const execution = handler.checkBridgeStatus(makeState(), SWAP_HASH, makeQuote(), 0);

    await expect(execution).rejects.toMatchObject({ isRecoverable: true });
    await expect(execution).rejects.toThrow("Bridge status check timed out after 0ms");
  });

  it("uses the block quote ID and fresh timeout signals for Squid and Axelar fallback requests", async () => {
    const requestSignals: AbortSignal[] = [];
    getStatus.mockImplementationOnce(async (...args: unknown[]) => {
      requestSignals.push(args[4] as AbortSignal);
      throw new Error("squid unavailable");
    });
    getStatusAxelarScan.mockImplementationOnce(async (...args: unknown[]) => {
      requestSignals.push(args[1] as AbortSignal);
      return { id: `${SWAP_HASH}_55_172`, status: "executed" } as never;
    });

    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    const status = await handler.getSquidrouterStatus(SWAP_HASH, makeState(), makeQuote());

    expect(status.status).toBe("success");
    expect(getStatus).toHaveBeenCalledWith(SWAP_HASH, "42161", "8453", "block-squid-quote", requestSignals[0]);
    expect(requestSignals[0]).toBeInstanceOf(AbortSignal);
    expect(requestSignals[1]).toBeInstanceOf(AbortSignal);
    expect(requestSignals[0]).not.toBe(requestSignals[1]);
  });

  it("persists the initial payment hash with a single-key patch", async () => {
    getStatusAxelarScan
      .mockImplementationOnce(async () => FEE_STATUS as never)
      .mockImplementationOnce(async () => ({ ...FEE_STATUS, status: "executed" }) as never);

    const state = makeState({ squidRouterPayTxHash: undefined });
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.initialDelayMs = 0;
    handler.pollIntervalMs = 0;
    handler.stuckAlertThresholdMs = Number.POSITIVE_INFINITY;
    handler.executeFundTransaction = mock(async () => "0xgasfunding");
    handler.createSubsidy = mock(async () => undefined);
    handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
      target.state = { ...target.state, [key]: value };
      return 1;
    });

    await handler.checkBridgeStatus(state, SWAP_HASH, makeQuote(), 1000);

    expect(handler.patchStateKey).toHaveBeenCalledWith(state, "squidRouterPayTxHash", "0xgasfunding");
    expect(state.state.squidRouterPayTxHash).toBe("0xgasfunding");
  });

  it("atomically claims and sends at most one supplemental gas top-up on the block source chain", async () => {
    const state = makeState();
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.executeFundTransaction = mock(async () => "0xtopup");
    handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
      target.state = { ...target.state, [key]: value };
      return 1;
    });

    const first = await handler.maybeTopUpGas(state, SWAP_HASH, makeQuote(), FEE_STATUS);
    const second = await handler.maybeTopUpGas(state, SWAP_HASH, makeQuote(), FEE_STATUS);

    expect(first).toContain("0xtopup");
    expect(second).toContain("already sent");
    expect(handler.patchStateKey).toHaveBeenNthCalledWith(
      1,
      state,
      "squidRouterExtraGasTxHash",
      "pending",
      `state->>'squidRouterExtraGasTxHash' IS NULL`
    );
    expect(handler.executeFundTransaction).toHaveBeenCalledTimes(1);
    expect(handler.executeFundTransaction.mock.calls[0]?.[0]).toBe(Networks.Arbitrum);
  });

  it("records stuck-confirm recovery before broadcasting and honors its cooldown", async () => {
    const state = makeState();
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
      target.state = { ...target.state, [key]: value };
      return 1;
    });

    const first = await handler.maybeRecoverStuckConfirm(state, SWAP_HASH, "arbitrum");
    const second = await handler.maybeRecoverStuckConfirm(state, SWAP_HASH, "arbitrum");

    expect(first).toContain("AXELAR_RECOVERY_HASH");
    expect(second).toContain("on cooldown");
    expect(handler.patchStateKey).toHaveBeenCalledTimes(1);
    expect(recoverAxelarStuckConfirm).toHaveBeenCalledTimes(1);
  });

  it("stops bridge polling when the processor aborts the signal", async () => {
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.initialDelayMs = 1000;
    handler.pollIntervalMs = 1000;
    const controller = new AbortController();

    const execution = handler.checkBridgeStatus(makeState(), SWAP_HASH, makeQuote(), 5000, controller.signal);
    controller.abort(new Error("phase timed out"));

    await expect(execution).rejects.toThrow();
    expect(getStatus).not.toHaveBeenCalled();
  });

  it("uses legacy EIP-1559 multipliers for Polygon and Base gas payments", async () => {
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;

    await handler.executeFundTransaction(Networks.Polygon, "1", SWAP_HASH, 1);
    expect(sendTransaction.mock.calls[0]?.[0]).toMatchObject({ maxFeePerGas: 10n, maxPriorityFeePerGas: 3n });

    await handler.executeFundTransaction(Networks.Base, "1", SWAP_HASH, 1);
    expect(sendTransaction.mock.calls[1]?.[0]).toMatchObject({ maxFeePerGas: 20n, maxPriorityFeePerGas: 6n });
  });
});
