import { afterAll, beforeAll, beforeEach, describe, expect, it } from "bun:test";
import type { MoneriumRedeemOrderRequest } from "@vortexfi/shared";
import { Address, Hex } from "viem";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumRecovery, { MoneriumRecoveryPhase } from "../../../models/moneriumRecovery.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import {
  activeRecoveryExists,
  driveRecovery,
  isPastDeadline,
  RecoveryDeps,
  refundEurAmount,
  refundMemo,
  refundNeed,
  reversePath,
  reverseSwapMinOut,
  runRecoveryDeadlines,
  runRecoveryOrchestrator
} from "./recovery";

const EUR = 10n ** 18n;
const USDC = 10n ** 6n;
const RECOVERY = "0x7777777777777777777777777777777777777777" as Address;
const FLOAT = "0x8888888888888888888888888888888888888888" as Address;
const EURE = "0x1111111111111111111111111111111111111111";
const EURC = "0x2222222222222222222222222222222222222222";
const USDC_TOKEN = "0x3333333333333333333333333333333333333333";

describe("reversePath", () => {
  it("reverses a two-hop packed path so the same pools run the other way", () => {
    const forward = `0x${EURE.slice(2)}0001f4${EURC.slice(2)}0001f4${USDC_TOKEN.slice(2)}` as Hex;
    expect(reversePath(forward)).toBe(`0x${USDC_TOKEN.slice(2)}0001f4${EURC.slice(2)}0001f4${EURE.slice(2)}`);
  });

  it("reverses a one-hop path and rejects malformed lengths", () => {
    const forward = `0x${EURE.slice(2)}000bb8${USDC_TOKEN.slice(2)}` as Hex;
    expect(reversePath(forward)).toBe(`0x${USDC_TOKEN.slice(2)}000bb8${EURE.slice(2)}`);
    expect(() => reversePath("0xabcd")).toThrow("packed path length");
  });
});

describe("refund arithmetic", () => {
  it("renders the issue amount to the cent and refuses sub-cent deposits", () => {
    expect(refundEurAmount((100n * EUR).toString())).toBe("100.00");
    expect(refundEurAmount("50000000000000000")).toBe("0.05");
    expect(refundEurAmount("1234570000000000000000")).toBe("1234.57");
    expect(() => refundEurAmount("1234567000000000000000")).toThrow("whole number of cents");
  });

  it("splits the difference between wallet balance and refund into top-up or surplus", () => {
    expect(refundNeed(100n * EUR, 98n * EUR)).toEqual({ surplus: 0n, topUp: 2n * EUR });
    expect(refundNeed(100n * EUR, 103n * EUR)).toEqual({ surplus: 3n * EUR, topUp: 0n });
    expect(refundNeed(100n * EUR, 100n * EUR)).toEqual({ surplus: 0n, topUp: 0n });
  });

  it("floors the reverse swap at the Chainlink rate less the slippage tolerance", () => {
    // 1140 USDC at 1.14 is 1000 EURe fair; 60 bps below is 994 EURe.
    expect(reverseSwapMinOut(1_140n * USDC, 114_000_000n, 8, 60)).toBe(994n * EUR);
  });

  it("counts the promised window from the mint, falling back to the row's creation", () => {
    const now = 1_800_000_000_000;
    const twoHours = 2 * 60 * 60 * 1000;
    const old = new Date(now - twoHours - 1);
    const fresh = new Date(now - 60_000);
    expect(isPastDeadline({ createdAt: fresh, mintedAt: old }, twoHours, now)).toBe(true);
    expect(isPastDeadline({ createdAt: old, mintedAt: fresh }, twoHours, now)).toBe(false);
    expect(isPastDeadline({ createdAt: old, mintedAt: null }, twoHours, now)).toBe(true);
  });
});

// ------------------------------------------------------------------ state machine with fakes

interface Ledger {
  eure: Map<string, bigint>;
  usdc: Map<string, bigint>;
}

function fakeDeps(
  ledger: Ledger,
  overrides: Partial<RecoveryDeps> & {
    orders?: Array<{ id: string; memo: string; rejectedReason?: string; state: string }>;
    receipts?: Record<string, "reverted" | "success">;
    swapOut?: bigint;
  } = {}
): RecoveryDeps & { calls: string[]; orders: Array<{ id: string; memo: string; rejectedReason?: string; state: string }> } {
  const calls: string[] = [];
  const orders = overrides.orders ?? [];
  const receipts = overrides.receipts ?? {};
  const get = (map: Map<string, bigint>, address: string) => map.get(address.toLowerCase()) ?? 0n;
  const add = (map: Map<string, bigint>, address: string, delta: bigint) =>
    map.set(address.toLowerCase(), get(map, address) + delta);
  const deps: RecoveryDeps = {
    createRedeemOrder: async request => {
      calls.push(`redeem:${request.amount}:${request.counterpart.identifier.iban}:${request.memo}`);
      orders.push({ id: "order-1", memo: request.memo as string, state: "placed" });
      return { id: "order-1" };
    },
    eureBalance: async address => get(ledger.eure, address),
    floatWallet: FLOAT,
    getOrder: async id => {
      const order = orders.find(entry => entry.id === id);
      if (!order) throw new Error("unknown order");
      return { rejectedReason: order.rejectedReason, state: order.state };
    },
    listOrdersByMemo: async (_address, memo) => orders.filter(order => order.memo === memo),
    moneriumChain: async () => "ethereum",
    now: () => new Date("2026-09-17T12:00:00Z"),
    oracle: async () => ({ decimals: 8, raw: 114_000_000n, slippageBps: 60 }),
    recoveryWallet: RECOVERY,
    reverseRoute: async () => "0xpath" as Hex,
    sendEure: async (from, to, amount) => {
      calls.push(`eure:${from}->${to.toLowerCase()}:${amount}`);
      const source = from === "float" ? FLOAT : RECOVERY;
      add(ledger.eure, source, -amount);
      add(ledger.eure, to, amount);
      return `0x${from}tx` as Hex;
    },
    sendReverseSwap: async (amountIn, minOut) => {
      calls.push(`swap:${amountIn}:${minOut}`);
      add(ledger.usdc, RECOVERY, -amountIn);
      add(ledger.eure, RECOVERY, overrides.swapOut ?? (amountIn * EUR) / (114n * USDC / 100n));
      return "0xswaptx" as Hex;
    },
    setDepositStatus: async (deposit, status) => {
      calls.push(`deposit:${status}`);
      (deposit as { status: MoneriumFiatDepositStatus }).status = status;
    },
    signMessage: async message => {
      calls.push(`sign:${message}`);
      return "0xsig";
    },
    usdcBalance: async address => get(ledger.usdc, address),
    waitReceipt: async hash => receipts[hash] ?? "success",
    ...overrides
  };
  return { ...deps, calls, orders };
}

function recoveryRow(fields: Partial<MoneriumRecovery> = {}): MoneriumRecovery {
  const row = {
    attempts: 0,
    error: null,
    eureFromSwapRaw: null,
    eureRecoveredRaw: (40n * EUR).toString(),
    floatTopupRaw: null,
    floatTopupTxHash: null,
    phase: MoneriumRecoveryPhase.Moved,
    redeemOrderId: null,
    refundAmount: null,
    reverseSwapTxHash: null,
    surplusRaw: null,
    surplusTxHash: null,
    usdcRecoveredRaw: (68n * USDC).toString(),
    ...fields,
    async update(values: Record<string, unknown>) {
      Object.assign(row, values);
    }
  };
  return row as unknown as MoneriumRecovery;
}

function depositRow(fields: Partial<MoneriumFiatDeposit> = {}): MoneriumFiatDeposit {
  return {
    amountRaw: (100n * EUR).toString(),
    id: "deposit-1",
    payerIban: "DE89370400440532013000",
    payerName: "Payer GmbH",
    status: MoneriumFiatDepositStatus.Recovering,
    ...fields
  } as unknown as MoneriumFiatDeposit;
}

describe("driveRecovery", () => {
  it("walks a chunked payment from the recovery wallet to a processed redeem order", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 40n * EUR], [FLOAT, 1_000n * EUR]]), usdc: new Map([[RECOVERY, 68n * USDC]]) };
    const deps = fakeDeps(ledger, { swapOut: 59n * EUR }); // 68 USDC back to 59 EURe: 1 EURe of slippage
    const recovery = recoveryRow();
    const deposit = depositRow();

    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapping);
    expect(deps.calls[0]).toBe(`swap:${68n * USDC}:${reverseSwapMinOut(68n * USDC, 114_000_000n, 8, 60)}`);

    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ eureFromSwapRaw: (59n * EUR).toString(), phase: MoneriumRecoveryPhase.Swapped });

    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ floatTopupRaw: (1n * EUR).toString(), phase: MoneriumRecoveryPhase.ToppingUp });
    expect(deps.calls.at(-1)).toBe(`eure:float->${RECOVERY.toLowerCase()}:${1n * EUR}`);

    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);

    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: "order-1", refundAmount: "100.00" });
    expect(deps.calls).toContain("sign:Send EUR 100.00 to DE89370400440532013000 at 2026-09-17T12:00Z");
    expect(deps.calls).toContain(`redeem:100.00:DE89370400440532013000:${refundMemo("deposit-1")}`);

    await driveRecovery(recovery, deposit, deps); // still placed
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeeming);
    deps.orders[0].state = "processed";
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.Refunded);
  });

  it("sweeps a surplus to the float and skips the swap when nothing was converted", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 103n * EUR]]), usdc: new Map() };
    const deps = fakeDeps(ledger);
    const recovery = recoveryRow({ eureRecoveredRaw: (103n * EUR).toString(), usdcRecoveredRaw: "0" });
    const deposit = depositRow();

    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ eureFromSwapRaw: "0", phase: MoneriumRecoveryPhase.Swapped });
    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.ToppingUp, surplusRaw: (3n * EUR).toString() });
    expect(deps.calls.at(-1)).toBe(`eure:recovery->${FLOAT.toLowerCase()}:${3n * EUR}`);
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
  });

  it("re-derives a lost swap from balances instead of swapping twice", async () => {
    // The swap landed (USDC gone, EURe up) but the hash never persisted.
    const ledger: Ledger = { eure: new Map([[RECOVERY, 99n * EUR]]), usdc: new Map([[RECOVERY, 0n]]) };
    const deps = fakeDeps(ledger);
    const recovery = recoveryRow({ phase: MoneriumRecoveryPhase.Swapping, reverseSwapTxHash: null });
    await driveRecovery(recovery, depositRow(), deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Moved);
    await driveRecovery(recovery, depositRow(), deps);
    expect(recovery).toMatchObject({ eureFromSwapRaw: (59n * EUR).toString(), phase: MoneriumRecoveryPhase.Swapped });
    expect(deps.calls.filter(call => call.startsWith("swap:"))).toHaveLength(0);
  });

  it("waits, without failing, while the float cannot cover the top-up", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 99n * EUR], [FLOAT, 0n]]), usdc: new Map() };
    const deps = fakeDeps(ledger);
    const recovery = recoveryRow({ phase: MoneriumRecoveryPhase.Swapped });
    const deposit = depositRow();
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapped);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.Recovering);
    expect(deps.calls).toEqual([]);
  });

  it("adopts an already placed order by memo instead of placing a second one", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() };
    const deps = fakeDeps(ledger, { orders: [{ id: "order-9", memo: refundMemo("deposit-1"), state: "pending" }] });
    const recovery = recoveryRow({ phase: MoneriumRecoveryPhase.ToppedUp });
    await driveRecovery(recovery, depositRow(), deps);
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: "order-9" });
    expect(deps.calls.some(call => call.startsWith("redeem:"))).toBe(false);
  });

  it("parks the deposit as recovery_failed when the refund cannot be automated", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() };
    const noPayer = depositRow({ payerIban: null });
    const recovery = recoveryRow({ phase: MoneriumRecoveryPhase.ToppedUp });
    await driveRecovery(recovery, noPayer, fakeDeps(ledger));
    expect(noPayer.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(recovery).toMatchObject({ error: expect.stringContaining("no payer IBAN"), phase: MoneriumRecoveryPhase.ToppedUp });

    const large = depositRow({ amountRaw: (20_000n * EUR).toString() });
    const bigRecovery = recoveryRow({ phase: MoneriumRecoveryPhase.ToppedUp });
    await driveRecovery(bigRecovery, large, fakeDeps({ eure: new Map([[RECOVERY, 20_000n * EUR]]), usdc: new Map() }));
    expect(large.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(bigRecovery.error).toContain("supporting document");

    const rejected = fakeDeps(ledger, { orders: [{ id: "o", memo: refundMemo("deposit-1"), rejectedReason: "compliance", state: "rejected" }] });
    const redeeming = recoveryRow({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: "o" });
    const deposit = depositRow();
    await driveRecovery(redeeming, deposit, rejected);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(redeeming.error).toContain("compliance");
  });

  it("retries a reverted reverse swap and fails after the fifth attempt", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 40n * EUR]]), usdc: new Map([[RECOVERY, 68n * USDC]]) };
    const deps = fakeDeps(ledger, {
      sendReverseSwap: async () => {
        throw new Error("STF");
      }
    });
    const recovery = recoveryRow();
    const deposit = depositRow();
    for (let attempt = 1; attempt <= 4; attempt++) {
      await driveRecovery(recovery, deposit, deps);
      expect(recovery).toMatchObject({ attempts: attempt, phase: MoneriumRecoveryPhase.Moved });
      expect(deposit.status).toBe(MoneriumFiatDepositStatus.Recovering);
    }
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.attempts).toBe(5);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
  });
});

// ------------------------------------------------------------------ deadlines + orchestrator (database)

describe("refund deadlines and orchestration", () => {
  const FORWARDER = "0x4444444444444444444444444444444444444444";
  const DESTINATION = "0x5555555555555555555555555555555555555555";
  let originalRpcUrl: string | undefined;
  let originalMode: typeof config.moneriumB2b.autoRecovery;

  beforeAll(async () => {
    originalRpcUrl = config.moneriumB2b.rpcUrl;
    originalMode = config.moneriumB2b.autoRecovery;
    config.moneriumB2b.rpcUrl = undefined;
    await setupTestDatabase();
  });

  afterAll(() => {
    config.moneriumB2b.rpcUrl = originalRpcUrl;
    config.moneriumB2b.autoRecovery = originalMode;
  });

  beforeEach(async () => {
    await resetTestDatabase();
    config.moneriumB2b.autoRecovery = "auto";
  });

  async function mappedAccount() {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    return provisionMoneriumB2bAccount({
      contactEmail: "ops@client.example.com",
      destination: DESTINATION,
      externalSubjectId: "client-1",
      forwarderAddress: FORWARDER,
      managerProfileId: manager.id,
      moneriumProfileId: "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e"
    });
  }

  function minted(accountId: string, orderId: string, mintedAt: Date, status = MoneriumFiatDepositStatus.Minted) {
    return MoneriumFiatDeposit.create({
      accountId,
      amountRaw: (100n * EUR).toString(),
      blockNumber: 100,
      chainId: 11155111,
      currency: "eur",
      logIndex: 1,
      mintedAt,
      moneriumOrderId: orderId,
      payerIban: "DE89370400440532013000",
      payerName: "Payer GmbH",
      status,
      txHash: `0x${orderId}`
    });
  }

  it("marks deposits past the promised window in auto mode and only reports them in alert mode", async () => {
    const { accountId } = await mappedAccount();
    const now = Date.now();
    const late = await minted(accountId, "late", new Date(now - 121 * 60_000));
    const fresh = await minted(accountId, "fresh", new Date(now - 10 * 60_000));

    config.moneriumB2b.autoRecovery = "alert";
    await runRecoveryDeadlines(now);
    await late.reload();
    expect(late.status).toBe(MoneriumFiatDepositStatus.Minted);

    config.moneriumB2b.autoRecovery = "auto";
    await runRecoveryDeadlines(now);
    await late.reload();
    await fresh.reload();
    expect(late.status).toBe(MoneriumFiatDepositStatus.Recovering);
    expect(fresh.status).toBe(MoneriumFiatDepositStatus.Minted);
  });

  it("opens one recovery per confirmed recover, drives it to the refund, and blocks a second recover meanwhile", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "stuck", new Date(), MoneriumFiatDepositStatus.Recovering);
    await MoneriumConversionExecution.create({
      accountId,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: (100n * EUR).toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xrecover",
      usdcNetRaw: "0"
    });
    expect(await activeRecoveryExists()).toBe(true);

    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const deps = fakeDeps(ledger, {
      setDepositStatus: async (row, status) => {
        await row.update({ status });
      }
    });
    const depsFor = async () => deps;

    await runRecoveryOrchestrator(depsFor); // opens the row: moved -> swapped (nothing to swap)
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapped);
    await runRecoveryOrchestrator(depsFor); // exact balance: topped up
    await runRecoveryOrchestrator(depsFor); // order placed
    await recovery.reload();
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.Redeeming, refundAmount: "100.00" });
    expect(await activeRecoveryExists()).toBe(true);

    deps.orders[0].state = "processed";
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    await deposit.reload();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.Refunded);
    expect(await activeRecoveryExists()).toBe(false);
  });

  it("holds the queue on a failed refund until the operator retries it", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "stuck", new Date(), MoneriumFiatDepositStatus.Recovering);
    await deposit.update({ payerIban: null });
    await MoneriumConversionExecution.create({
      accountId,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: (100n * EUR).toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xrecover",
      usdcNetRaw: "0"
    });
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() };
    const deps = fakeDeps(ledger, {
      setDepositStatus: async (row, status) => {
        await row.update({ status });
      }
    });
    const depsFor = async () => deps;
    for (let i = 0; i < 3; i++) await runRecoveryOrchestrator(depsFor);
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery.error).toContain("payer IBAN");
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
    expect(await activeRecoveryExists()).toBe(true);

    // Operator fixes the payer and retries: the run resumes from the preserved phase.
    await deposit.update({ payerIban: "DE89370400440532013000", status: MoneriumFiatDepositStatus.Recovering });
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    expect(recovery.error).toBeNull();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeeming);
  });
});
