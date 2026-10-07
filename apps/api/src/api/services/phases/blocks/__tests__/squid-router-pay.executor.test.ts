import { afterAll, beforeEach, describe, expect, it, mock } from "bun:test";
import * as sharedNamespace from "@vortexfi/shared";
import { Networks } from "@vortexfi/shared";
import Big from "big.js";
import { decodeFunctionData, keccak256, parseAbi } from "viem";
import type QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";
import * as financialOperationNamespace from "../core/financial-operation";
import { settlementBalanceKey } from "../core/settlement";

const sharedReal = { ...sharedNamespace };
const financialOperationReal = { ...financialOperationNamespace };
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
const checkEvmBalanceForToken = mock(async (..._args: unknown[]) => new Big("900100"));
const estimateFeesPerGas = mock(async () => ({ maxFeePerGas: 10n, maxPriorityFeePerGas: 3n }));
const sendTransaction = mock(async (_transaction: Record<string, unknown>) => "0xgasfunding" as `0x${string}`);
const estimateGas = mock(async (..._args: unknown[]) => 318_000n);
const getBalance = mock(async (..._args: unknown[]) => 10n ** 18n);
const waitForTransactionReceipt = mock(async (..._args: unknown[]) => ({ status: "success" }));
const fundingAccount = { address: "0x1111111111111111111111111111111111111111" as `0x${string}` };

mock.module("@vortexfi/shared", () => ({
  ...sharedReal,
  EvmClientManager: {
    getInstance: () => ({
      getClient: () => ({
        chain: {},
        estimateFeesPerGas,
        estimateGas,
        getBalance,
        getTransactionCount: async () => 0,
        waitForTransactionReceipt
      }),
      getWalletClient: () => ({ account: fundingAccount, sendTransaction })
    })
  },
  checkEvmBalanceForToken,
  getStatus,
  getStatusAxelarScan,
  recoverAxelarStuckConfirm
}));
mock.module("../core/financial-operation", () => ({
  ...financialOperationReal,
  requireFinancialFlowIdentity: () => ({ id: "test-flow", version: 1 }),
  runFinancialOperation: async ({ perform }: { perform(key: string): Promise<unknown> }) => perform("test-operation")
}));

const { SquidRouterPayExecutor } = await import("../phases/squid-router-swap/execution");

afterAll(() => {
  mock.module("@vortexfi/shared", () => ({ ...sharedReal }));
  mock.module("../core/financial-operation", () => ({ ...financialOperationReal }));
});

beforeEach(() => {
  getStatus.mockClear();
  getStatusAxelarScan.mockClear();
  recoverAxelarStuckConfirm.mockClear();
  checkEvmBalanceForToken.mockClear();
  estimateFeesPerGas.mockClear();
  sendTransaction.mockClear();
  estimateGas.mockClear();
  getBalance.mockClear();
  waitForTransactionReceipt.mockClear();
  estimateGas.mockImplementation(async () => 318_000n);
  sendTransaction.mockImplementation(async () => "0xgasfunding" as `0x${string}`);
  waitForTransactionReceipt.mockImplementation(async () => ({ status: "success" }));
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
          outputAmountRaw: "1000000",
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
    expect(status.evidenceProvider).toBe("axelar");
  });

  it("persists a route-scoped 90% balance fallback instead of accepting any positive balance", async () => {
    const quote = makeQuote();
    const tokenDetails = sharedReal.getOnChainTokenDetails(Networks.Base, quote.outputCurrency as never) as {
      erc20AddressSourceChain: string;
    };
    const address = "0x2222222222222222222222222222222222222222";
    const baselineKey = settlementBalanceKey(Networks.Base, address, tokenDetails.erc20AddressSourceChain);
    const state = makeState({
      evmEphemeralAddress: address,
      transactionPlan: { settlementBaselines: { [baselineKey]: "100" } }
    });
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.initialDelayMs = 60_000;
    handler.patchStateKey = mock(async (target: RampState, key: string, value: unknown) => {
      target.state = { ...target.state, [key]: value };
      return 1;
    });

    await handler.checkStatus(state, SWAP_HASH, quote);

    expect(checkEvmBalanceForToken).toHaveBeenCalledWith(
      expect.objectContaining({
        amountDesiredRaw: "900100",
        chain: Networks.Base,
        ownerAddress: address
      })
    );
    expect(state.state.squidRouterDeliveryEvidence).toMatchObject({
      baselineRaw: "100",
      expectedAmountRaw: "1000000",
      kind: "destination-balance",
      minimumRatioBps: 9000,
      sourceTransactionHash: SWAP_HASH
    });
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
    expect(handler.executeFundTransaction.mock.calls[0]?.[1]).toBe(Networks.Arbitrum);
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

  it("triggers confirm recovery on confirm_failed whatever the status, until the call is approved", async () => {
    // Live shape on 2026-10-06 (Base -> BSC): the failed poll left status "confirmed", not "called".
    const failedPoll = {
      ...FEE_STATUS,
      call: { chain: "base" },
      confirm_failed: true,
      is_insufficient_fee: false,
      status: "confirmed"
    };
    const pollUntilExecuted = async (axelarStatus: Record<string, unknown>) => {
      getStatusAxelarScan
        .mockImplementationOnce(async () => axelarStatus as never)
        .mockImplementationOnce(async () => ({ ...axelarStatus, status: "executed" }) as never);
      const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
      handler.initialDelayMs = 0;
      handler.pollIntervalMs = 0;
      handler.stuckAlertThresholdMs = Number.POSITIVE_INFINITY;
      handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
        target.state = { ...target.state, [key]: value };
        return 1;
      });
      const state = makeState();
      await handler.checkBridgeStatus(state, SWAP_HASH, makeQuote(), 1000);
      return state;
    };

    const recovered = await pollUntilExecuted(failedPoll);
    expect(recoverAxelarStuckConfirm).toHaveBeenCalledTimes(1);
    expect(recoverAxelarStuckConfirm.mock.calls[0]?.slice(0, 2)).toEqual([SWAP_HASH, "base"]);
    expect(recovered.state.axelarConfirmRecoveryAt).toBeString();

    const approved = await pollUntilExecuted({
      ...failedPoll,
      approved: { block_timestamp: 1_791_295_300 },
      status: "approved"
    });
    expect(recoverAxelarStuckConfirm).toHaveBeenCalledTimes(1);
    expect(approved.state.axelarConfirmRecoveryAt).toBeUndefined();
  });

  it("alerts once with block context and the current stuck classification", async () => {
    const state = makeState();
    state.phaseHistory = [{ phase: "squidRouterPay", timestamp: new Date(Date.now() - 30 * 60 * 1000) }];
    state.errorLogs = [{ error: "Bridge status check timed out", phase: "squidRouterPay", timestamp: new Date().toISOString() }];
    const sendMessage = mock(async (_message: { text: string }) => undefined);
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.slackNotifier = { sendMessage };
    handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
      target.state = { ...target.state, [key]: value };
      return 1;
    });
    handler.maybeRecoverStuckConfirm = mock(async () => "confirm recovery on cooldown");

    await handler.monitorStuckGmp(state, SWAP_HASH, makeQuote(), {
      call: { chain: "arbitrum" },
      id: `${SWAP_HASH}_55_172`,
      status: "called"
    });

    expect(sendMessage).toHaveBeenCalledTimes(1);
    const text = sendMessage.mock.calls[0]![0].text;
    expect(text).toContain("classification: waiting_source_confirmation");
    expect(text).toContain("block-ramp-1");
    expect(text).toContain("block-squid-quote");
    expect(text).toContain("Bridge status check timed out");
  });

  it("suppresses a stuck alert when another execution claims the alert slot", async () => {
    const sendMessage = mock(async (_message: { text: string }) => undefined);
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.stuckAlertThresholdMs = 0;
    handler.slackNotifier = { sendMessage };
    handler.patchStateKey = mock(async () => 0);
    handler.maybeRecoverStuckConfirm = mock(async () => "already attempted");

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(), {
      call: { chain: "arbitrum" },
      id: `${SWAP_HASH}_55_172`,
      status: "called"
    });

    expect(sendMessage).not.toHaveBeenCalled();
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

  it("uses the configured EIP-1559 multipliers for Polygon and Base gas payments", async () => {
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;

    await handler.executeFundTransaction(makeState(), Networks.Polygon, "1", SWAP_HASH, 1, "initial-gas-payment");
    expect(sendTransaction.mock.calls[0]?.[0]).toMatchObject({ maxFeePerGas: 10n, maxPriorityFeePerGas: 3n });

    await handler.executeFundTransaction(makeState(), Networks.Base, "1", SWAP_HASH, 1, "initial-gas-payment");
    expect(sendTransaction.mock.calls[1]?.[0]).toMatchObject({ maxFeePerGas: 20n, maxPriorityFeePerGas: 6n });
  });

  it("searches Axelarscan once per poll when the Squid status falls back to it", async () => {
    getStatus
      .mockImplementationOnce(async () => {
        throw new Error("squid unavailable");
      })
      .mockImplementationOnce(async () => ({
        id: "",
        isGMPTransaction: true,
        routeStatus: [],
        squidTransactionStatus: "",
        status: "success"
      }));
    getStatusAxelarScan.mockImplementation(async () => ({ id: `${SWAP_HASH}_17_1`, status: "approved" }) as never);
    const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
    handler.initialDelayMs = 0;
    handler.pollIntervalMs = 0;
    handler.stuckAlertThresholdMs = Number.POSITIVE_INFINITY;

    await handler.checkBridgeStatus(makeState(), SWAP_HASH, makeQuote(Networks.Base), 1000);

    expect(getStatusAxelarScan).toHaveBeenCalledTimes(1);
  });
});

const SQUID_ROUTER = "0xce16F69375520ab01377ce7B88f5BA8C48F8D666";
const PAYLOAD = "0x00000000000000000000000000000000000000000000000000000000000000400000" as const;
const COMMAND_ID = "0x2d130523637b387cd09fa4859e8a4b8210a08a5d7247b67d6054aabdfd25ee01";

// Shape of the 2026-10-05/06 incidents: approved on BSC, relayer never executed.
function approvedNotExecutedStatus(overrides: Record<string, unknown> = {}) {
  return {
    approved: {
      block_timestamp: Math.floor(Date.now() / 1000) - 30 * 60,
      returnValues: {
        contractAddress: SQUID_ROUTER,
        payloadHash: keccak256(PAYLOAD),
        sourceAddress: SQUID_ROUTER,
        sourceChain: "base"
      }
    },
    call: {
      chain: "base",
      event: "ContractCallWithToken",
      returnValues: { amount: "15702688", payload: PAYLOAD, symbol: "axlUSDC" }
    },
    command_id: COMMAND_ID,
    gas_status: null,
    id: `${SWAP_HASH}_17_1`,
    is_insufficient_fee: false,
    no_gas_remain: true,
    status: "executing",
    ...overrides
  } as never;
}

function makeExecuteHandler(claimedRows = 1) {
  const sendMessage = mock(async (_message: { text: string }) => undefined);
  const handler = Object.create(SquidRouterPayExecutor.prototype) as any;
  handler.stuckAlertThresholdMs = 0;
  handler.slackNotifier = { sendMessage };
  handler.patchStateKey = mock(async (target: RampState, key: string, value: string) => {
    if (claimedRows === 0) return 0;
    target.state = { ...target.state, [key]: value };
    return 1;
  });
  return { handler, sendMessage };
}

describe("SquidRouterPayExecutor approved-not-executed recovery", () => {
  it("executes the approved call once on the destination chain and reports it", async () => {
    sendTransaction.mockImplementation(async () => "0xexecute" as `0x${string}`);
    const state = makeState();
    const { handler, sendMessage } = makeExecuteHandler();

    await handler.monitorStuckGmp(state, SWAP_HASH, makeQuote(Networks.Base), approvedNotExecutedStatus());
    await handler.monitorStuckGmp(state, SWAP_HASH, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(sendTransaction).toHaveBeenCalledTimes(1);
    const tx = sendTransaction.mock.calls[0]![0] as { data: `0x${string}`; to: string; gas: bigint; value?: bigint };
    expect(tx.to).toBe(SQUID_ROUTER);
    expect(tx.value).toBeUndefined();
    expect(tx.gas).toBe((318_000n * 6n) / 5n);
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function executeWithToken(bytes32 commandId, string sourceChain, string sourceAddress, bytes payload, string tokenSymbol, uint256 amount)"
      ]),
      data: tx.data
    });
    expect(decoded.args).toEqual([COMMAND_ID, "base", SQUID_ROUTER, PAYLOAD, "axlUSDC", 15702688n]);
    expect(handler.patchStateKey).toHaveBeenCalledWith(
      state,
      "squidRouterAxelarExecuteTxHash",
      "pending",
      `state->>'squidRouterAxelarExecuteTxHash' IS NULL`
    );
    expect(state.state.squidRouterAxelarExecuteTxHash).toBe("0xexecute");
    expect(sendMessage).toHaveBeenCalledTimes(1);
    expect(sendMessage.mock.calls[0]![0].text).toContain("classification: approved_not_executed");
    expect(sendMessage.mock.calls[0]![0].text).toContain("executed the approved call on base (0xexecute)");
  });

  it("uses execute() for a ContractCall without tokens", async () => {
    const { handler } = makeExecuteHandler();
    const status = approvedNotExecutedStatus({ call: { chain: "base", event: "ContractCall", returnValues: { payload: PAYLOAD } } });

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(Networks.Base), status);

    const tx = sendTransaction.mock.calls[0]![0] as { data: `0x${string}` };
    const decoded = decodeFunctionData({
      abi: parseAbi(["function execute(bytes32 commandId, string sourceChain, string sourceAddress, bytes payload)"]),
      data: tx.data
    });
    expect(decoded.args).toEqual([COMMAND_ID, "base", SQUID_ROUTER, PAYLOAD]);
  });

  it("does not execute before the stuck threshold", async () => {
    const { handler, sendMessage } = makeExecuteHandler();
    handler.stuckAlertThresholdMs = Number.POSITIVE_INFINITY;

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("does not execute when the call was already executed or the relayer is executing", async () => {
    const { handler } = makeExecuteHandler();

    await handler.monitorStuckGmp(
      makeState(),
      SWAP_HASH,
      makeQuote(Networks.Base),
      approvedNotExecutedStatus({ executed: { transactionHash: "0xrelayer" }, status: "executed" })
    );
    await handler.monitorStuckGmp(
      makeState(),
      SWAP_HASH,
      makeQuote(Networks.Base),
      approvedNotExecutedStatus({ executing: { transactionHash: "0xrelayer" } })
    );

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("does not execute when the processor aborted the execution", async () => {
    const { handler } = makeExecuteHandler();
    const controller = new AbortController();
    controller.abort(new Error("phase timed out"));

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(Networks.Base), approvedNotExecutedStatus(), controller.signal);

    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("does not execute when a concurrent execution holds the claim", async () => {
    const { handler } = makeExecuteHandler(0);

    const outcome = await handler.maybeExecuteApprovedGmp(makeState(), makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(outcome).toContain("claimed by a concurrent execution");
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("refuses to send and alerts when the payload does not match the approved hash", async () => {
    const { handler, sendMessage } = makeExecuteHandler();
    const status = approvedNotExecutedStatus({
      approved: { block_timestamp: 0, returnValues: { contractAddress: SQUID_ROUTER, payloadHash: keccak256("0x1234"), sourceAddress: SQUID_ROUTER, sourceChain: "base" } }
    });

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(Networks.Base), status);

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(handler.patchStateKey).not.toHaveBeenCalledWith(expect.anything(), "squidRouterAxelarExecuteTxHash", "pending", expect.anything());
    expect(sendMessage.mock.calls[0]![0].text).toContain("refusing to execute: payload does not match");
  });

  it("refuses to send and alerts when the simulation reverts", async () => {
    estimateGas.mockImplementation(async () => {
      throw new Error("execution reverted: NotApprovedByGateway");
    });
    const { handler, sendMessage } = makeExecuteHandler();

    await handler.monitorStuckGmp(makeState(), SWAP_HASH, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(sendTransaction).not.toHaveBeenCalled();
    expect(sendMessage.mock.calls[0]![0].text).toContain("refusing to execute: simulation failed");
  });

  it("does not claim when the funding wallet lacks native gas on the destination chain", async () => {
    getBalance.mockImplementationOnce(async () => 0n);
    const state = makeState();
    const { handler } = makeExecuteHandler();

    const outcome = await handler.maybeExecuteApprovedGmp(state, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(outcome).toContain("lacks native gas on base");
    expect(state.state.squidRouterAxelarExecuteTxHash).toBeUndefined();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("uses the approved destination token when it differs from the source call", async () => {
    const { handler } = makeExecuteHandler();
    const status = approvedNotExecutedStatus({
      approved: {
        block_timestamp: 0,
        returnValues: {
          amount: "15702688",
          contractAddress: SQUID_ROUTER,
          payloadHash: keccak256(PAYLOAD),
          sourceAddress: SQUID_ROUTER,
          sourceChain: "base",
          symbol: "USDC"
        }
      }
    });

    await handler.maybeExecuteApprovedGmp(makeState(), makeQuote(Networks.Base), status);

    const tx = sendTransaction.mock.calls[0]![0] as { data: `0x${string}` };
    const decoded = decodeFunctionData({
      abi: parseAbi([
        "function executeWithToken(bytes32 commandId, string sourceChain, string sourceAddress, bytes payload, string tokenSymbol, uint256 amount)"
      ]),
      data: tx.data
    });
    expect(decoded.args[4]).toBe("USDC");
  });

  it("refuses to send when the estimated gas exceeds the cap", async () => {
    estimateGas.mockImplementation(async () => 1_600_001n);
    const state = makeState();
    const { handler } = makeExecuteHandler();

    const outcome = await handler.maybeExecuteApprovedGmp(state, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(outcome).toContain("exceeds 1600000");
    expect(state.state.squidRouterAxelarExecuteTxHash).toBeUndefined();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("keeps the claim and never resends when the send fails after claiming", async () => {
    sendTransaction.mockImplementation(async () => {
      throw new Error("rpc dropped the request");
    });
    const state = makeState();
    const { handler } = makeExecuteHandler();

    const first = await handler.maybeExecuteApprovedGmp(state, makeQuote(Networks.Base), approvedNotExecutedStatus());
    const second = await handler.maybeExecuteApprovedGmp(state, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(first).toContain("failed after claim");
    expect(second).toContain("unknown outcome; not retrying");
    expect(state.state.squidRouterAxelarExecuteTxHash).toBe("pending");
    expect(sendTransaction).toHaveBeenCalledTimes(1);
  });

  it("keeps the claim when the execute reverts on-chain", async () => {
    waitForTransactionReceipt.mockImplementation(async () => ({ status: "reverted" }));
    const state = makeState();
    const { handler } = makeExecuteHandler();

    const outcome = await handler.maybeExecuteApprovedGmp(state, makeQuote(Networks.Base), approvedNotExecutedStatus());

    expect(outcome).toContain("failed after claim");
    expect(outcome).toContain("reverted");
    expect(state.state.squidRouterAxelarExecuteTxHash).toBe("pending");
  });

  it("does not send when an earlier execution left a pending claim", async () => {
    const { handler } = makeExecuteHandler();

    const outcome = await handler.maybeExecuteApprovedGmp(
      makeState({ squidRouterAxelarExecuteTxHash: "pending" }),
      makeQuote(Networks.Base),
      approvedNotExecutedStatus()
    );

    expect(outcome).toContain("unknown outcome; not retrying");
    expect(handler.patchStateKey).not.toHaveBeenCalled();
    expect(estimateGas).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });

  it("does not execute for a non-EVM destination", async () => {
    const { handler } = makeExecuteHandler();
    const quote = { ...makeQuote(Networks.Base), to: Networks.AssetHub } as unknown as QuoteTicket;
    (quote.metadata as any).blocks.squidRouterSwap.toNetwork = Networks.AssetHub;

    const outcome = await handler.maybeExecuteApprovedGmp(makeState(), quote, approvedNotExecutedStatus());

    expect(outcome).toContain("not an EVM chain");
    expect(estimateGas).not.toHaveBeenCalled();
    expect(sendTransaction).not.toHaveBeenCalled();
  });
});
