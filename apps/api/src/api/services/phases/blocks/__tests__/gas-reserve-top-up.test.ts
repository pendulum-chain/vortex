import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test";
import { EvmToken, Networks } from "@vortexfi/shared";
import Big from "big.js";
import logger from "../../../../../config/logger";
import QuoteTicket from "../../../../../models/quoteTicket.model";
import { installFakeFinancialJournal } from "../../../../../test-utils/fake-financial-journal";
import { ReconciliationRequiredPhaseError, RecoverablePhaseError } from "../../../../errors/phase-error";
import type { PhaseCtx } from "../core/types";
import {
  GasReserveTopUpContext,
  type GasReserveTopUpMetadata,
  registerGasReserveTopUp,
  simulateGasReserveTopUp
} from "../phases/gas-reserve-top-up/simulation";

const journal = installFakeFinancialJournal();
const { GasReserveTopUpExecutor } = await import("../phases/gas-reserve-top-up/execution");
type Dependencies = NonNullable<ConstructorParameters<typeof GasReserveTopUpExecutor>[0]>;

afterAll(() => journal.restore());
beforeEach(() => journal.reset());
afterEach(() => mock.restore());

const DESTINATION = "0x1111111111111111111111111111111111111111";
const AMOUNT = 30_000_000_000_000n;
const MAX_FEE_PER_GAS = 30_000_000n;
const HASH = `0x${"ab".repeat(32)}` as const;

function quoteWith(metadata: GasReserveTopUpMetadata) {
  spyOn(QuoteTicket, "findByPk").mockResolvedValue({ metadata: { blocks: { [GasReserveTopUpContext.key]: metadata } } } as never);
}

function rampState() {
  const state = {
    currentPhase: "gasReserveTopUp",
    errorLogs: [],
    get() {
      return this;
    },
    id: "ramp-1",
    phaseHistory: [],
    quoteId: "quote-1",
    state: { destinationAddress: DESTINATION, flow: { id: "test-flow", version: 1 } },
    async update(patch: Record<string, unknown>) {
      Object.assign(state, patch);
      return state;
    }
  };
  return state as never;
}

function fakeChain(overrides: Partial<Dependencies> = {}) {
  const sends: Array<{ gas: bigint; to: string; value: bigint }> = [];
  const dependencies: Dependencies = {
    estimateMaxFeePerGas: async () => MAX_FEE_PER_GAS,
    getNativeBalance: async () => AMOUNT * 2n,
    getReceipt: async () => ({ status: "success" }),
    send: async transaction => {
      sends.push(transaction);
      return HASH;
    },
    waitForReceipt: async () => ({ status: "success" }),
    ...overrides
  };
  return { executor: new GasReserveTopUpExecutor(dependencies), sends };
}

describe("GasReserveTopUpExecutor", () => {
  it("does nothing for a zero reserve", async () => {
    quoteWith({ amountRaw: "0" });
    const { executor, sends } = fakeChain();

    await executor.execute(rampState());

    expect(sends).toEqual([]);
    expect(journal.attempts).toEqual([]);
  });

  it("sends exactly the quoted wei to the destination, with a fixed gas limit", async () => {
    quoteWith({ amountRaw: AMOUNT.toString(), quotedFor: DESTINATION });
    const { executor, sends } = fakeChain();

    await executor.execute(rampState());

    expect(sends).toEqual([{ gas: 100_000n, to: DESTINATION, value: AMOUNT }]);
    expect(journal.attempts).toEqual(["gas-reserve-top-up"]);
  });

  it("does not spend twice when re-entered after its receipt was lost", async () => {
    quoteWith({ amountRaw: AMOUNT.toString() });
    let lost = true;
    const { executor, sends } = fakeChain({
      waitForReceipt: async () => {
        if (lost) throw new Error("rpc lost");
        return { status: "success" };
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);
    lost = false;

    await executor.execute(state);
    await executor.execute(state);

    expect(sends).toHaveLength(1);
    expect(journal.rows.get("gas-reserve-top-up")?.status).toBe("confirmed");
  });

  it("pauses rather than risks a second send when no hash was recorded", async () => {
    quoteWith({ amountRaw: AMOUNT.toString() });
    let attempts = 0;
    const { executor } = fakeChain({
      send: async () => {
        attempts += 1;
        throw new Error("rpc lost mid-send");
      }
    });
    const state = rampState();
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    await expect(executor.execute(state)).rejects.toBeInstanceOf(ReconciliationRequiredPhaseError);

    expect(attempts).toBe(1);
  });

  it("logs and retries on a low funding balance, before any send", async () => {
    quoteWith({ amountRaw: AMOUNT.toString() });
    const error = spyOn(logger, "error");
    const { executor, sends } = fakeChain({ getNativeBalance: async () => AMOUNT - 1n });

    const thrown = await executor.execute(rampState()).catch(value => value);

    expect(thrown).toBeInstanceOf(RecoverablePhaseError);
    expect(thrown).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sends).toEqual([]);
    expect(journal.rows.get("gas-reserve-top-up")).toBeUndefined();
    expect(error).toHaveBeenCalledWith("EVM_FUNDING_TOKEN_BALANCE_LOW", expect.objectContaining({ token: "ETH" }));
  });

  it("holds unclaimed while the funding wallet cannot also pay the gas, and sends once it is refilled", async () => {
    quoteWith({ amountRaw: AMOUNT.toString() });
    const error = spyOn(logger, "error");
    let balance = AMOUNT;
    const { executor, sends } = fakeChain({ getNativeBalance: async () => balance });
    const state = rampState();

    const thrown = await executor.execute(state).catch(value => value);

    expect(thrown).toBeInstanceOf(RecoverablePhaseError);
    expect(thrown).not.toBeInstanceOf(ReconciliationRequiredPhaseError);
    expect(sends).toEqual([]);
    expect(journal.rows.get("gas-reserve-top-up")).toBeUndefined();
    expect(error).toHaveBeenCalledWith(
      "EVM_FUNDING_TOKEN_BALANCE_LOW",
      expect.objectContaining({ requiredRaw: (AMOUNT + 100_000n * MAX_FEE_PER_GAS).toString(), token: "ETH" })
    );

    balance = AMOUNT + 100_000n * MAX_FEE_PER_GAS;
    await executor.execute(state);

    expect(sends).toHaveLength(1);
    expect(journal.rows.get("gas-reserve-top-up")?.status).toBe("confirmed");
  });

  it.each([
    ["a mined revert", { waitForReceipt: async () => ({ status: "reverted" as const }) }],
    [
      "an RPC failure",
      {
        getNativeBalance: async () => {
          throw new TypeError("rpc returned nonsense");
        }
      }
    ]
  ])("never fails the ramp on %s, and does not repeat a mined send", async (_label, overrides) => {
    quoteWith({ amountRaw: AMOUNT.toString() });
    const { executor, sends } = fakeChain(overrides);
    const state = rampState();

    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);
    await expect(executor.execute(state)).rejects.toBeInstanceOf(RecoverablePhaseError);

    expect(sends.length).toBeLessThanOrEqual(1);
  });
});

describe("GasReserveTopUp simulation", () => {
  const input = {
    amount: new Big(1),
    amountRaw: "1000000000000000000",
    chain: Networks.Robinhood,
    token: EvmToken.NVDA
  } as const;

  it("passes through and keeps what was quoted for the register hook", async () => {
    const ctx = {
      gasReserve: { amountRaw: "42", currency: "ETH", fiat: "1", quotedFor: DESTINATION, usd: "0.2" }
    } as unknown as PhaseCtx;

    const result = await simulateGasReserveTopUp(input, ctx);

    expect(result.output).toBe(input);
    expect(result.metadata).toEqual({ amountRaw: "42", quotedFor: DESTINATION });
  });

  it("means a zero reserve when none was quoted", async () => {
    expect((await simulateGasReserveTopUp(input, {} as PhaseCtx)).metadata).toEqual({ amountRaw: "0" });
  });
});

describe("GasReserveTopUp registration", () => {
  const register = (metadata: GasReserveTopUpMetadata, destinationAddress?: string) =>
    registerGasReserveTopUp({
      authenticatedUser: { id: "user" },
      input: { destinationAddress },
      metadata,
      quote: {} as never,
      signingAccounts: []
    });

  it("accepts the quoted address in any casing", async () => {
    const mixedCase = "0xAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCdEfAbCd";

    expect(await register({ amountRaw: "1", quotedFor: mixedCase }, mixedCase.toLowerCase())).toEqual({ facts: {} });
  });

  it("rejects another address, even for a zero reserve", async () => {
    await expect(register({ amountRaw: "0", quotedFor: DESTINATION }, "0x2222222222222222222222222222222222222222")).rejects.toMatchObject({
      isPublic: true,
      status: 400
    });
  });

  it("accepts any address for a quote made without one", async () => {
    expect(await register({ amountRaw: "1" }, DESTINATION)).toEqual({ facts: {} });
  });
});
