import { afterAll, afterEach, beforeAll, describe, expect, it, mock, spyOn } from "bun:test";
import * as solangNamespace from "@pendulum-chain/api-solang";
import * as sharedNamespace from "@vortexfi/shared";
import Big from "big.js";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import type RampState from "../../../../../models/rampState.model";

const sharedReal = { ...sharedNamespace };
const fundingAccount = { address: "funding" };
type BalanceResponse = { free: { toString(): string } };
const accounts = mock(async (_address: string, _currencyId: unknown): Promise<BalanceResponse> => ({
  free: { toString: (): string => "0" }
}));
const approvals = mock(async (): Promise<{ toString(): string }> => ({ toString: (): string => "0" }));
const executeApiCall = mock(async () => ({ hash: "0xsubsidy" }));
const decodeSubmittableExtrinsic = mock(() => ({}));
const submitExtrinsic = mock(async () => ({ status: { type: "success" }, txHash: { toString: (): string => "0xfee" } }));
const submitXTokens = mock(async () => ({ hash: "0xxcm" }));
const getEvmTokenBalance = mock(async () => new Big(100));
const waitUntilTrueWithTimeout = mock(async (predicate: () => Promise<boolean>) => {
  if (!(await predicate())) throw new Error("balance did not settle");
});
const pendulum = {
  api: {
    query: { tokenAllowance: { approvals }, tokens: { accounts } },
    registry: { getChainProperties: () => undefined },
    tx: { tokens: { transfer: () => ({}) } }
  },
  ss58Format: 57
};
const getApi = mock(async () => pendulum);
const ownedSpies: Array<{ mockRestore(): void }> = [];

let SubsidizePreSwapExecutor: typeof import("../phases/subsidize-pre/execution").SubsidizePreSwapExecutor;
let SubsidizePostSwapExecutor: typeof import("../phases/subsidize-post/execution").SubsidizePostSwapExecutor;
let DistributeFeesExecutor: typeof import("../phases/distribute-fees/execution").DistributeFeesExecutor;
let NablaApproveExecutor: typeof import("../phases/nabla-swap/execution").NablaApproveExecutor;
let PendulumToAveniaXcmExecutor: typeof import("../phases/avenia-pendulum-offramp/execution").PendulumToAveniaXcmExecutor;
const originalFindByPk = QuoteTicket.findByPk;
const originalFindOne = QuoteTicket.findOne;
const originalFetch = globalThis.fetch;

beforeAll(async () => {
  const funding = await import("../../../../controllers/subsidize.controller");
  ownedSpies.push(
    spyOn(sharedNamespace.ApiManager, "getInstance").mockReturnValue({ executeApiCall, getApi } as never),
    spyOn(sharedNamespace, "decodeSubmittableExtrinsic").mockImplementation(decodeSubmittableExtrinsic as never),
    spyOn(sharedNamespace, "getAddressForFormat").mockImplementation((address: string) => address),
    spyOn(sharedNamespace, "getEvmTokenBalance").mockImplementation(getEvmTokenBalance as never),
    spyOn(sharedNamespace, "submitXTokens").mockImplementation(submitXTokens as never),
    spyOn(sharedNamespace, "waitUntilTrueWithTimeout").mockImplementation(waitUntilTrueWithTimeout as never),
    spyOn(solangNamespace, "submitExtrinsic").mockImplementation(submitExtrinsic as never),
    spyOn(funding, "getFundingAccount").mockReturnValue(fundingAccount as never)
  );
  ({ SubsidizePreSwapExecutor } = await import("../phases/subsidize-pre/execution"));
  ({ SubsidizePostSwapExecutor } = await import("../phases/subsidize-post/execution"));
  ({ DistributeFeesExecutor } = await import("../phases/distribute-fees/execution"));
  ({ NablaApproveExecutor } = await import("../phases/nabla-swap/execution"));
  ({ PendulumToAveniaXcmExecutor } = await import("../phases/avenia-pendulum-offramp/execution"));
});

afterEach(() => {
  accounts.mockReset();
  approvals.mockReset();
  executeApiCall.mockReset();
  executeApiCall.mockImplementation(async () => ({ hash: "0xsubsidy" }));
  decodeSubmittableExtrinsic.mockReset();
  decodeSubmittableExtrinsic.mockImplementation(() => ({}));
  submitExtrinsic.mockClear();
  submitXTokens.mockClear();
  getApi.mockReset();
  getApi.mockImplementation(async () => pendulum);
  getEvmTokenBalance.mockReset();
  getEvmTokenBalance.mockImplementation(async () => new Big(100));
  waitUntilTrueWithTimeout.mockClear();
  globalThis.fetch = originalFetch;
});

afterAll(() => {
  QuoteTicket.findByPk = originalFindByPk;
  QuoteTicket.findOne = originalFindOne;
  globalThis.fetch = originalFetch;
  for (const spy of ownedSpies) spy.mockRestore();
});

function state(overrides: Record<string, unknown> = {}): RampState {
  return {
    id: "ramp-1",
    presignedTxs: [{ phase: "distributeFees", txData: "0x01" }, { phase: "pendulumToMoonbeamXcm", txData: "0x02" }],
    quoteId: "quote-1",
    state: { substrateEphemeralAddress: "ephemeral", ...overrides },
    update: mock(async () => undefined)
  } as unknown as RampState;
}

function setQuoteBlock(key: string, metadata: Record<string, unknown>): void {
  const quote = { metadata: { blocks: { [key]: metadata } } };
  QuoteTicket.findByPk = mock(async () => quote) as typeof QuoteTicket.findByPk;
  QuoteTicket.findOne = mock(async () => quote) as typeof QuoteTicket.findOne;
}

function expose<T>(executor: T): T & { executePhase(state: RampState): Promise<RampState>; createSubsidy: ReturnType<typeof mock> } {
  return executor as T & { executePhase(state: RampState): Promise<RampState>; createSubsidy: ReturnType<typeof mock> };
}

describe("Pendulum block executor regressions", () => {
  it("waits for pre-subsidy target balance settlement", async () => {
    setQuoteBlock("subsidizePreSwap", {
      inputCurrency: "BRL",
      inputCurrencyId: { token: "BRL" },
      inputDecimals: 2,
      network: "pendulum",
      targetInputAmountRaw: "100"
    });
    accounts.mockImplementation(async address => ({
      free: { toString: () => (address === "funding" ? "1000" : accounts.mock.calls.length >= 3 ? "100" : "50") }
    }));
    const executor = expose(new SubsidizePreSwapExecutor());
    executor.createSubsidy = mock(async () => undefined);

    await executor.executePhase(state());

    expect(waitUntilTrueWithTimeout).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveBeenCalledTimes(3);
  });

  it("waits for post-subsidy target balance settlement", async () => {
    setQuoteBlock("subsidizePostSwap", {
      network: "pendulum",
      outputCurrency: "USDC",
      outputCurrencyId: { token: "USDC" },
      outputDecimals: 6,
      targetOutputAmountRaw: "100"
    });
    accounts.mockImplementation(async address => ({
      free: { toString: () => (address === "funding" ? "1000" : accounts.mock.calls.length >= 3 ? "100" : "50") }
    }));
    const executor = expose(new SubsidizePostSwapExecutor());
    executor.createSubsidy = mock(async () => undefined);

    await executor.executePhase(state());

    expect(waitUntilTrueWithTimeout).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveBeenCalledTimes(3);
  });

  it("keeps transient subsidy RPC errors recoverable but insufficient funding unrecoverable", async () => {
    setQuoteBlock("subsidizePreSwap", {
      inputCurrency: "BRL",
      inputCurrencyId: { token: "BRL" },
      inputDecimals: 2,
      network: "pendulum",
      targetInputAmountRaw: "100"
    });
    accounts.mockRejectedValueOnce(new Error("RPC unavailable"));
    const executor = expose(new SubsidizePreSwapExecutor());
    await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: true });

    accounts.mockImplementation(async address => ({ free: { toString: () => (address === "funding" ? "1" : "50") } }));
    await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: false });

    setQuoteBlock("subsidizePostSwap", {
      network: "pendulum",
      outputCurrency: "USDC",
      outputCurrencyId: { token: "USDC" },
      outputDecimals: 6,
      targetOutputAmountRaw: "100"
    });
    accounts.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(expose(new SubsidizePostSwapExecutor()).executePhase(state())).rejects.toMatchObject({ isRecoverable: true });
  });

  it("checks a persisted Pendulum fee hash before advancing", async () => {
    setQuoteBlock("distributeFees", { network: "pendulum", totalFeesUsd: "1" });
    globalThis.fetch = mock(async () =>
      Response.json({ code: 0, data: { success: true } })
    ) as unknown as typeof fetch;

    await expose(new DistributeFeesExecutor()).executePhase(state({ distributeFeeHash: "0xexisting" }));

    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(submitExtrinsic).not.toHaveBeenCalled();
  });

  it("keeps Pendulum fee status, query, decode, and submission failures recoverable", async () => {
    setQuoteBlock("distributeFees", {
      network: "pendulum",
      outputCurrencyId: { token: "USDC" },
      outputDecimals: 6,
      totalFeesUsd: "1"
    });
    const executor = expose(new DistributeFeesExecutor());
    globalThis.fetch = mock(async () => {
      throw new Error("Subscan unavailable");
    }) as unknown as typeof fetch;
    await expect(executor.executePhase(state({ distributeFeeHash: "0xexisting" }))).rejects.toMatchObject({ isRecoverable: true });

    accounts.mockRejectedValueOnce(new Error("RPC unavailable"));
    await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: true });

    accounts.mockResolvedValue({ free: { toString: () => "1000000" } });
    decodeSubmittableExtrinsic.mockImplementationOnce(() => {
      throw new Error("decode unavailable");
    });
    await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: true });

    submitExtrinsic.mockRejectedValueOnce(new Error("submission unavailable"));
    await expect(executor.executePhase(state())).rejects.toMatchObject({ isRecoverable: true });
  });

  it("keeps Pendulum Nabla allowance-query failures recoverable", async () => {
    setQuoteBlock("nablaSwap", {
      inputAmountForSwapRaw: "100",
      inputCurrencyId: { token: "BRL" },
      network: "pendulum"
    });
    approvals.mockRejectedValueOnce(new Error("RPC unavailable"));

    await expect(expose(new NablaApproveExecutor()).executePhase(state())).rejects.toMatchObject({ isRecoverable: true });
  });

  it("records the fixed GLMR subsidy after a new Pendulum-to-Avenia XCM submission", async () => {
    setQuoteBlock("aveniaPendulumOfframp", {
      pendulumCurrencyId: { token: "BRL" },
      transferAmountRaw: "100"
    });
    accounts.mockResolvedValue({ free: { toString: () => "100" } });
    const rampState = state({
      blockState: { aveniaPendulumOfframp: { brlaEvmAddress: "0x1111111111111111111111111111111111111111" } }
    });
    const executor = expose(new PendulumToAveniaXcmExecutor());
    executor.createSubsidy = mock(async () => undefined);

    await executor.executePhase(rampState);

    expect(executor.createSubsidy).toHaveBeenCalledWith(
      rampState,
      sharedReal.nativeToDecimal(sharedReal.MOONBEAM_XCM_FEE_GLMR, 18).toNumber(),
      "GLMR",
      "ephemeral",
      "0xxcm"
    );
  });
});
