import { afterAll, afterEach, describe, expect, it, mock, spyOn } from "bun:test";
import {
  type EvmTransactionData,
  Networks,
  type PresignedTx,
  RampDirection,
  RELAY_BASE_USDC_ADDRESS,
  RELAY_ROBINHOOD_USDG_ADDRESS,
  RelayApiError,
  type RelayIntentStatus,
  relayIntentStatusSchema
} from "@vortexfi/shared";
import { keccak256 } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { APIError } from "../../../../errors/api-error";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError } from "../../../../errors/phase-error";
import { getPhaseProcessorMaxExecutionTimeMs, getSquidRouterPayTimeoutMs } from "../../../phases/phase-processor-config";
import * as financialOperationNamespace from "../core/financial-operation";

const financialOperationReal = { ...financialOperationNamespace };
type Row = { response?: unknown; status: "confirmed" | "failed" | "submitted" };
const operationRows = new Map<string, Row>();
const operationAttempts: string[] = [];

/** The journal's states that matter to a retried broadcast, without its table. */
mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({
    attemptClass,
    beforePerform,
    perform,
    reconcile
  }: {
    attemptClass: string;
    beforePerform?: () => Promise<void>;
    perform(key: string): Promise<unknown>;
    reconcile?: (operation: unknown) => Promise<unknown>;
  }) => {
    operationAttempts.push(attemptClass);
    const row = operationRows.get(attemptClass);
    if (row?.status === "confirmed") return row.response;
    if (row?.status === "failed") throw new APIError({ message: `${attemptClass} definitively failed`, status: 409 });
    if (row?.status === "submitted") {
      let reconciled: unknown;
      try {
        reconciled = await reconcile?.({});
      } catch (error) {
        operationRows.set(attemptClass, { status: "failed" });
        throw error;
      }
      if (!reconciled) {
        throw new financialOperationReal.FinancialOperationReconciliationRequiredError(
          { id: attemptClass } as never,
          "has submitted outcome"
        );
      }
      operationRows.set(attemptClass, { response: reconciled, status: "confirmed" });
      return reconciled;
    }
    await beforePerform?.();
    operationRows.set(attemptClass, { status: "submitted" });
    try {
      const response = await perform(`test-${attemptClass}`);
      operationRows.set(attemptClass, { response, status: "confirmed" });
      return response;
    } catch (error) {
      if (error instanceof financialOperationReal.FinancialOperationRejectedError) {
        operationRows.set(attemptClass, { status: "failed" });
      }
      throw error;
    }
  }
}));

const { RelayBridgeExecutor } = await import("../phases/stock-route/execution");
type Dependencies = NonNullable<ConstructorParameters<typeof RelayBridgeExecutor>[0]>;

const originalFindByPk = QuoteTicket.findByPk;

afterAll(() => {
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

afterEach(() => {
  QuoteTicket.findByPk = originalFindByPk;
  operationRows.clear();
  operationAttempts.length = 0;
  mock.restore();
});

const ephemeral = privateKeyToAccount("0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d");
const REQUEST_ID = `0x${"12".repeat(32)}`;
const DEPOSIT_TX_IN = `0x${"aa".repeat(32)}`;
const FILL_TX = `0x${"bb".repeat(32)}`;
const USDG_REQUIRED = 99_920_012n;
const USDC_MINIMUM = 85_021_456n;
const DEPOSIT_AMOUNT = 99_980_000n;

const status = (value: RelayIntentStatus["status"], extra: Partial<RelayIntentStatus> = {}): RelayIntentStatus =>
  relayIntentStatusSchema.parse({ status: value, ...extra });
const SUCCESS = status("success", { inTxHashes: [DEPOSIT_TX_IN], txHashes: [FILL_TX] });

function blueprint(phase: "relayApprove" | "relayBridge", nonce: number): PresignedTx {
  return {
    meta: {},
    network: Networks.Base,
    nonce,
    phase,
    signer: ephemeral.address,
    txData: {
      data: phase === "relayApprove" ? "0x095ea7b3" : "0xe8017952",
      gas: "75000",
      maxFeePerGas: "6500000",
      maxPriorityFeePerGas: "1000000",
      to: phase === "relayApprove" ? RELAY_BASE_USDC_ADDRESS : "0x4cd00e387622c35bddb9b4c962c136462338bc31",
      value: "0"
    }
  } as PresignedTx;
}

async function sign(unsigned: PresignedTx, patch: Partial<EvmTransactionData> = {}): Promise<PresignedTx> {
  const txData = { ...(unsigned.txData as EvmTransactionData), ...patch };
  const serialized = await ephemeral.signTransaction({
    chainId: 8453,
    data: txData.data,
    gas: BigInt(txData.gas),
    maxFeePerGas: BigInt(txData.maxFeePerGas as string),
    maxPriorityFeePerGas: BigInt(txData.maxPriorityFeePerGas as string),
    nonce: unsigned.nonce,
    to: txData.to,
    type: "eip1559",
    value: BigInt(txData.value)
  });
  return { ...unsigned, txData: serialized };
}

function blockState(direction: RampDirection) {
  return direction === RampDirection.BUY
    ? { relayInputAmountRaw: DEPOSIT_AMOUNT.toString(), relayRequestId: REQUEST_ID, swapDeadline: "9999999999" }
    : {
        relayDepositAddress: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC",
        relayMinimumOutputRaw: USDC_MINIMUM.toString(),
        relayRequestId: REQUEST_ID,
        swapDeadline: "9999999999"
      };
}

function quoteMetadata(direction: RampDirection) {
  return { blocks: { stockRoute: { bridge: { outputAmountRaw: USDG_REQUIRED.toString() }, direction, token: "NVDA" } } };
}

async function rampState(direction: RampDirection, overrides: { blockState?: unknown; presignedTxs?: PresignedTx[] } = {}) {
  const approve = blueprint("relayApprove", 5);
  const deposit = blueprint("relayBridge", 6);
  QuoteTicket.findByPk = mock(async () => ({ metadata: quoteMetadata(direction) })) as typeof QuoteTicket.findByPk;
  return {
    currentPhase: "relayBridge",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-relay-1",
    phaseHistory: [],
    presignedTxs: overrides.presignedTxs ?? (direction === RampDirection.BUY ? [await sign(approve), await sign(deposit)] : []),
    quoteId: "quote-relay-1",
    state: {
      blockState: { stockRoute: overrides.blockState ?? blockState(direction) },
      evmEphemeralAddress: ephemeral.address,
      flow: { id: "test-flow", version: 1 }
    } as Record<string, unknown>,
    unsignedTxs: direction === RampDirection.BUY ? [approve, deposit] : [],
    async update(update: Record<string, unknown>) {
      Object.assign(this, update);
      return this;
    }
  };
}

type Ramp = Awaited<ReturnType<typeof rampState>>;

/** A chain and a Relay answering from scripts, on a clock that only the poll's sleep advances. */
function world(statuses: Array<RelayIntentStatus | Error>, balances: { base?: bigint; robinhood?: bigint } = {}) {
  const state = {
    balances: { base: DEPOSIT_AMOUNT, robinhood: 0n, ...balances },
    clock: 1_000_000,
    receipts: new Map<string, { status: "success" | "reverted" }>(),
    statusCalls: 0
  };
  const sendRawTransaction = mock(async (transaction: `0x${string}`) => keccak256(transaction));
  const getBalance = mock(async (network: string, _token: string, _owner: string) =>
    network === Networks.Base ? state.balances.base : state.balances.robinhood
  );
  const sleep = mock(async (milliseconds: number) => {
    state.clock += milliseconds;
  });
  const deps: Dependencies = {
    getBalance,
    getIntentStatus: mock(async () => {
      state.statusCalls += 1;
      const next = statuses.length > 1 ? statuses.shift() : statuses[0];
      if (next instanceof Error) throw next;
      return next as RelayIntentStatus;
    }),
    getReceipt: async hash => state.receipts.get(hash) ?? null,
    now: () => state.clock,
    sendRawTransaction,
    sleep,
    waitForReceipt: async () => ({ status: "success" })
  };
  return { deps, getBalance, sendRawTransaction, sleep, state };
}

const run = (ramp: Ramp, deps: Dependencies, signal?: AbortSignal) =>
  new RelayBridgeExecutor(deps).execute(ramp as never, signal);

const FUNDED_ARRIVAL = { robinhood: USDG_REQUIRED };

describe("Relay status matrix", () => {
  it.each(["waiting", "depositing", "pending", "submitted", "unknown"] as const)(
    "keeps polling on %s without reading the balance",
    async value => {
      const ramp = await rampState(RampDirection.SELL);
      const { deps, getBalance, sleep, state } = world([status(value), status(value), SUCCESS], { base: USDC_MINIMUM });
      await run(ramp, deps);
      expect(state.statusCalls).toBe(3);
      expect(sleep).toHaveBeenCalledTimes(2);
      expect(getBalance).toHaveBeenCalledTimes(1);
    }
  );

  it("keeps polling on failure without a refund failure, which can still go either way", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, state } = world([status("failure", { failReason: "SOLVER_CAPACITY_EXCEEDED" }), SUCCESS], { base: USDC_MINIMUM });
    await run(ramp, deps);
    expect(state.statusCalls).toBe(2);
  });

  it("does not read Relay's N/A as a refund failure", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, state } = world([status("failure", { refundFailReason: "N/A" }), SUCCESS], { base: USDC_MINIMUM });
    await run(ramp, deps);
    expect(state.statusCalls).toBe(2);
  });

  it("pauses on failure with a refund failure", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, getBalance } = world([status("failure", { refundFailReason: "AMOUNT_TOO_LOW_TO_REFUND" })]);
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(getBalance).not.toHaveBeenCalled();
  });

  it.each([RampDirection.BUY, RampDirection.SELL])("pauses a %s on refund, whatever the balance says", async direction => {
    const ramp = await rampState(direction);
    const { deps } = world([status("refund", { failReason: "TRANSACTION_REVERTED" })], { base: 10n ** 12n, robinhood: 10n ** 12n });
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(ramp.state.relayFillHash).toBeUndefined();
  });
});

describe("arrival evidence", () => {
  it("buy: success needs the bridged USDG on the ephemeral on 4663", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const { deps, getBalance } = world([SUCCESS], FUNDED_ARRIVAL);
    await run(ramp, deps);
    expect(getBalance).toHaveBeenLastCalledWith(Networks.Robinhood, RELAY_ROBINHOOD_USDG_ADDRESS, ephemeral.address);
  });

  it("sell: success needs the order minimum in USDC on the ephemeral on Base", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, getBalance } = world([SUCCESS], { base: USDC_MINIMUM });
    await run(ramp, deps);
    expect(getBalance).toHaveBeenLastCalledWith(Networks.Base, RELAY_BASE_USDC_ADDRESS, ephemeral.address);
  });

  it.each<[RampDirection, { base?: bigint; robinhood?: bigint }]>([
    [RampDirection.BUY, { robinhood: USDG_REQUIRED - 1n }],
    [RampDirection.SELL, { base: USDC_MINIMUM - 1n }]
  ])("%s: success one unit short keeps waiting, then is transient", async (direction, balances) => {
    const ramp = await rampState(direction);
    const { deps } = world([SUCCESS], balances);
    const error = await run(ramp, deps).catch(value => value);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(error.message).toContain(`balance ${direction === RampDirection.BUY ? USDG_REQUIRED - 1n : USDC_MINIMUM - 1n}`);
  });

  it("persists both hashes on a sell, where the executor sent nothing", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, sendRawTransaction } = world([SUCCESS], { base: USDC_MINIMUM });
    await run(ramp, deps);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(operationAttempts).toEqual([]);
    expect(ramp.state).toMatchObject({ relayBridgeHash: DEPOSIT_TX_IN, relayFillHash: FILL_TX });
  });

  describe("status API unavailable", () => {
    it.each<[string, Error]>([
      ["a provider error", new RelayApiError({ endpoint: "/intents/status/v3", method: "GET", responseBody: "", status: 503 })],
      ["an unparseable answer", new Error("Invalid enum value")]
    ])("accepts a satisfied balance after %s, and logs the fallback", async (_label, failure) => {
      const warn = spyOn(logger, "warn").mockImplementation(() => logger);
      const ramp = await rampState(RampDirection.BUY);
      const { deps } = world([failure], FUNDED_ARRIVAL);
      await run(ramp, deps);
      expect(warn).toHaveBeenCalledWith(expect.stringContaining("RELAY_ARRIVAL_BALANCE_FALLBACK"));
      expect(ramp.state.relayFillHash).toBeUndefined();
    });

    it("keeps waiting while the balance is short, and is transient at the bound", async () => {
      const ramp = await rampState(RampDirection.SELL);
      const { deps } = world([new Error("gateway timeout")], { base: USDC_MINIMUM - 1n });
      await expect(run(ramp, deps)).rejects.toBeInstanceOf(RecoverablePhaseError);
    });

    it("recovers when the API returns mid-poll", async () => {
      const ramp = await rampState(RampDirection.SELL);
      const { deps, state } = world([new Error("gateway timeout"), status("pending"), SUCCESS], { base: USDC_MINIMUM - 1n });
      const originalSleep = deps.sleep;
      deps.sleep = async (milliseconds, signal) => {
        await originalSleep(milliseconds, signal);
        if (state.statusCalls === 2) state.balances.base = USDC_MINIMUM;
      };
      await run(ramp, deps);
      expect(ramp.state.relayFillHash).toBe(FILL_TX);
    });
  });
});

describe("poll bound and cancellation", () => {
  it("raises a transient error at about 80% of the phase timeout, so the phase re-enters", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, state } = world([status("pending")]);
    const startedAt = state.clock;
    const error = await run(ramp, deps).catch(value => value);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(error.message).toContain(REQUEST_ID);
    expect(state.clock - startedAt).toBeGreaterThanOrEqual(getSquidRouterPayTimeoutMs());
    expect(state.clock - startedAt).toBeLessThan(getPhaseProcessorMaxExecutionTimeMs());
  });

  it("stops at once on an aborted signal, without asking Relay", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps, state } = world([SUCCESS], { base: USDC_MINIMUM });
    const controller = new AbortController();
    controller.abort(new Error("phase timed out"));
    await expect(run(ramp, deps, controller.signal)).rejects.toBeInstanceOf(RecoverablePhaseError);
    expect(state.statusCalls).toBe(0);
  });

  it("does not take an aborted status call for an unavailable API", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const controller = new AbortController();
    const { deps, getBalance } = world([], { base: USDC_MINIMUM });
    deps.getIntentStatus = async () => {
      controller.abort(new Error("phase timed out"));
      throw new Error("aborted fetch");
    };
    await expect(run(ramp, deps, controller.signal)).rejects.toThrow("phase timed out");
    expect(getBalance).not.toHaveBeenCalled();
  });

  it("hands the signal to the status call and the sleep", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const controller = new AbortController();
    const { deps, sleep } = world([status("pending"), SUCCESS], { base: USDC_MINIMUM });
    await run(ramp, deps, controller.signal);
    expect(deps.getIntentStatus).toHaveBeenCalledWith(REQUEST_ID, controller.signal);
    expect(sleep).toHaveBeenCalledWith(10_000, controller.signal);
  });
});

describe("buy broadcast", () => {
  const signedHashes = (ramp: Ramp) => ramp.presignedTxs.map(tx => keccak256(tx.txData as `0x${string}`));

  it("sends the approval, then the deposit, each under its own journal class", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const { deps, sendRawTransaction } = world([SUCCESS], FUNDED_ARRIVAL);
    await run(ramp, deps);
    expect(sendRawTransaction.mock.calls.map(([tx]) => tx)).toEqual(ramp.presignedTxs.map(tx => tx.txData as `0x${string}`));
    expect(operationAttempts).toEqual(["relay-approve", "relay-deposit"]);
  });

  it("persists the deposit hash before waiting, and the fill hash on arrival", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const { deps } = world([status("pending")], FUNDED_ARRIVAL);
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(RecoverablePhaseError);
    const [, depositHash] = signedHashes(ramp);
    expect(ramp.state.relayBridgeHash).toBe(depositHash);
    expect(ramp.state.relayFillHash).toBeUndefined();

    await run(ramp, world([SUCCESS], FUNDED_ARRIVAL).deps);
    expect(ramp.state).toMatchObject({ relayBridgeHash: depositHash, relayFillHash: FILL_TX });
  });

  it("does not broadcast twice when the phase re-enters after a poll timeout, even with the input spent", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const first = world([status("pending")]);
    await expect(run(ramp, first.deps)).rejects.toBeInstanceOf(RecoverablePhaseError);
    expect(first.sendRawTransaction).toHaveBeenCalledTimes(2);

    const second = world([SUCCESS], { base: 0n, robinhood: USDG_REQUIRED });
    await run(ramp, second.deps);
    expect(second.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("settles a deposit a crash left unconfirmed from its receipt, without resending", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const [approveHash, depositHash] = signedHashes(ramp);
    operationRows.set("relay-approve", { response: { hash: approveHash }, status: "confirmed" });
    operationRows.set("relay-deposit", { status: "submitted" });
    const { deps, sendRawTransaction, state } = world([SUCCESS], { base: 0n, robinhood: USDG_REQUIRED });
    state.receipts.set(depositHash, { status: "success" });
    await run(ramp, deps);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(ramp.state.relayFillHash).toBe(FILL_TX);
  });

  it("sends the same signed deposit again when a crash left it with no receipt, and settles it", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const [approveHash, depositHash] = signedHashes(ramp);
    operationRows.set("relay-approve", { response: { hash: approveHash }, status: "confirmed" });
    operationRows.set("relay-deposit", { status: "submitted" });
    const { deps, sendRawTransaction } = world([SUCCESS], FUNDED_ARRIVAL);
    await run(ramp, deps);
    expect(sendRawTransaction.mock.calls).toEqual([[ramp.presignedTxs[1].txData as `0x${string}`]]);
    expect(ramp.state.relayBridgeHash).toBe(depositHash);
  });

  it("pauses when the node refuses the deposit again", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const [approveHash] = signedHashes(ramp);
    operationRows.set("relay-approve", { response: { hash: approveHash }, status: "confirmed" });
    operationRows.set("relay-deposit", { status: "submitted" });
    const { deps, sendRawTransaction, state } = world([SUCCESS], FUNDED_ARRIVAL);
    deps.sendRawTransaction = mock(async () => {
      throw new Error("nonce too low");
    });
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(state.statusCalls).toBe(0);
  });

  it("pauses on a mined revert, and stays paused on re-entry without resending", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const first = world([SUCCESS], FUNDED_ARRIVAL);
    first.deps.waitForReceipt = async () => ({ status: "reverted" });
    await expect(run(ramp, first.deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(first.sendRawTransaction).toHaveBeenCalledTimes(1);

    const second = world([SUCCESS], FUNDED_ARRIVAL);
    await expect(run(ramp, second.deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(second.sendRawTransaction).not.toHaveBeenCalled();
  });

  it("does not spend the nonce until the input has settled", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const { deps, sendRawTransaction, state } = world([SUCCESS], { base: DEPOSIT_AMOUNT - 1n });
    const error = await run(ramp, deps).catch(value => value);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
    expect(operationRows.size).toBe(0);
    expect(state.statusCalls).toBe(0);
  });

  it("rejects a node that reports another hash for the transaction", async () => {
    const ramp = await rampState(RampDirection.BUY);
    const { deps, state } = world([SUCCESS], FUNDED_ARRIVAL);
    deps.sendRawTransaction = async () => `0x${"ee".repeat(32)}`;
    await expect(run(ramp, deps)).rejects.toThrow("expected");
    expect(state.statusCalls).toBe(0);
  });

  it("pauses on a presigned transaction that differs from its blueprint", async () => {
    const approve = blueprint("relayApprove", 5);
    const deposit = blueprint("relayBridge", 6);
    const ramp = await rampState(RampDirection.BUY, {
      presignedTxs: [await sign(approve), await sign(deposit, { to: "0x1111111111111111111111111111111111111111" })]
    });
    const { deps, sendRawTransaction } = world([SUCCESS], FUNDED_ARRIVAL);
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });

  it("pauses when a presigned transaction is missing", async () => {
    const ramp = await rampState(RampDirection.BUY, { presignedTxs: [] });
    const { deps, sendRawTransaction } = world([SUCCESS], FUNDED_ARRIVAL);
    await expect(run(ramp, deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sendRawTransaction).not.toHaveBeenCalled();
  });
});

describe("never fails the ramp", () => {
  it.each<[string, RampDirection, Record<string, unknown>]>([
    ["no request id", RampDirection.SELL, { relayMinimumOutputRaw: "1" }],
    ["no sell minimum", RampDirection.SELL, { relayRequestId: REQUEST_ID }],
    ["a zero sell minimum", RampDirection.SELL, { relayMinimumOutputRaw: "0", relayRequestId: REQUEST_ID }],
    ["no buy deposit amount", RampDirection.BUY, { relayRequestId: REQUEST_ID }]
  ])("pauses on state with %s", async (_label, direction, state) => {
    const ramp = await rampState(direction, { blockState: state });
    await expect(run(ramp, world([SUCCESS], FUNDED_ARRIVAL).deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
  });

  it("pauses when the quote is gone", async () => {
    const ramp = await rampState(RampDirection.SELL);
    QuoteTicket.findByPk = mock(async () => null) as typeof QuoteTicket.findByPk;
    await expect(run(ramp, world([SUCCESS]).deps)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);
  });

  it("treats an RPC failure as transient", async () => {
    const ramp = await rampState(RampDirection.SELL);
    const { deps } = world([SUCCESS]);
    deps.getBalance = async () => {
      throw new Error("rpc down");
    };
    const error = await run(ramp, deps).catch(value => value);
    expect(error).toBeInstanceOf(RecoverablePhaseError);
    expect(error).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
  });
});
