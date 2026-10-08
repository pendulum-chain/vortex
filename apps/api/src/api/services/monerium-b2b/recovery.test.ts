import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, setSystemTime, spyOn } from "bun:test";
import type { MoneriumRedeemOrderRequest } from "@vortexfi/shared";
import { Address, Hex } from "viem";
import logger from "../../../config/logger";
import { config } from "../../../config/vars";
import ManagedProfileManager from "../../../models/managedProfileManager.model";
import MoneriumAccount from "../../../models/moneriumAccount.model";
import MoneriumConversionExecution, {
  MoneriumConversionExecutionKind,
  MoneriumConversionExecutionStatus
} from "../../../models/moneriumConversionExecution.model";
import MoneriumFiatDeposit, { MoneriumFiatDepositStatus } from "../../../models/moneriumFiatDeposit.model";
import MoneriumRecovery, { MoneriumRecoveryPhase } from "../../../models/moneriumRecovery.model";
import { resetTestDatabase, setupTestDatabase } from "../../../test-utils/db";
import { createTestUser } from "../../../test-utils/factories";
import { provisionMoneriumB2bAccount } from "./account-provisioning";
import * as chain from "./chain";
import { runConversionExecutor } from "./conversion-executor";
import { runRefundMonitor } from "./monitoring";
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
  runRecoveryOrchestrator,
  setDepositStatus
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
    /** One log shared across clients, so a test sees the order of sends in a cycle. */
    calls?: string[];
  } = {}
): RecoveryDeps & { calls: string[]; orders: Array<{ id: string; memo: string; rejectedReason?: string; state: string }> } {
  const calls = overrides.calls ?? [];
  const wallet = overrides.recoveryWallet ?? RECOVERY;
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
    recoveryWallet: wallet,
    reverseRoute: async () => "0xpath" as Hex,
    sendEure: async (from, to, amount) => {
      calls.push(`eure:${from}->${to.toLowerCase()}:${amount}`);
      const source = from === "float" ? FLOAT : wallet;
      add(ledger.eure, source, -amount);
      add(ledger.eure, to, amount);
      return `0x${from}tx` as Hex;
    },
    sendReverseSwap: async (amountIn, minOut) => {
      calls.push(`swap:${amountIn}:${minOut}`);
      add(ledger.usdc, wallet, -amountIn);
      add(ledger.eure, wallet, overrides.swapOut ?? (amountIn * EUR) / (114n * USDC / 100n));
      return "0xswaptx" as Hex;
    },
    setDepositStatus: async (deposit, status) => {
      calls.push(`deposit:${status}`);
      (deposit as { status: MoneriumFiatDepositStatus }).status = status;
      return null;
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

  it("waits for a surplus sweep sent after a confirmed top-up, not for the top-up again", async () => {
    // More EURe reached the wallet after an earlier top-up confirmed; the sweep of the
    // excess lands only once its own receipt arrives, as on chain.
    const ledger: Ledger = { eure: new Map([[RECOVERY, 103n * EUR]]), usdc: new Map() };
    const sweeps: bigint[] = [];
    const deps = fakeDeps(ledger, {
      sendEure: async (_from, _to, amount) => {
        sweeps.push(amount);
        return "0xsweeptx" as Hex;
      },
      waitReceipt: async hash => {
        if (hash === "0xsweeptx") ledger.eure.set(RECOVERY, 100n * EUR);
        return "success";
      }
    });
    const recovery = recoveryRow({
      floatTopupRaw: (1n * EUR).toString(),
      floatTopupTxHash: "0xfloattx",
      phase: MoneriumRecoveryPhase.Swapped
    });
    const deposit = depositRow();

    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppingUp);
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
    expect(sweeps).toEqual([3n * EUR]);
  });

  it("waits instead of skipping the reverse swap when a node behind the recover reads no USDC", async () => {
    const ledger: Ledger = { eure: new Map([[RECOVERY, 40n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map([[RECOVERY, 68n * USDC]]) };
    let lagging = true; // the RPC answers from before the recover's block: neither the EURe nor the USDC is there yet
    const deps = fakeDeps(ledger, {
      eureBalance: async address => (lagging ? 0n : (ledger.eure.get(address.toLowerCase()) ?? 0n)),
      usdcBalance: async address => (lagging ? 0n : (ledger.usdc.get(address.toLowerCase()) ?? 0n))
    });
    const recovery = recoveryRow();
    const deposit = depositRow();

    await driveRecovery(recovery, deposit, deps);
    expect(recovery).toMatchObject({ eureFromSwapRaw: null, phase: MoneriumRecoveryPhase.Moved });
    expect(deps.calls).toEqual([]);

    lagging = false;
    await driveRecovery(recovery, deposit, deps);
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapping);
    expect(deps.calls[0]).toStartWith(`swap:${68n * USDC}:`);
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

  it("keeps a processed refund open, without the refunded log, until the deposit is marked refunded", async () => {
    const info = spyOn(logger, "info");
    info.mockClear(); // another file's leaked logger mock can carry earlier calls into the spy
    const refundedLogged = () => info.mock.calls.some(([message]) => String(message).includes("refunded"));
    try {
      const ledger: Ledger = { eure: new Map(), usdc: new Map() };
      const orders = [{ id: "order-1", memo: refundMemo("deposit-1"), state: "processed" }];
      const recovery = recoveryRow({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: "order-1", refundAmount: "100.00" });
      const deposit = depositRow();

      await driveRecovery(recovery, deposit, fakeDeps(ledger, { orders, setDepositStatus: async () => "Monerium account not found" }));
      expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeeming);

      const throwing = fakeDeps(ledger, {
        orders,
        setDepositStatus: async () => {
          throw new Error("connection reset");
        }
      });
      await expect(driveRecovery(recovery, deposit, throwing)).rejects.toThrow("connection reset");
      expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeeming);
      expect(refundedLogged()).toBe(false);

      await driveRecovery(recovery, deposit, fakeDeps(ledger, { orders }));
      expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
      expect(deposit.status).toBe(MoneriumFiatDepositStatus.Refunded);
      expect(refundedLogged()).toBe(true);
    } finally {
      info.mockRestore();
    }
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

  afterEach(() => {
    (logger.error as unknown as { mockRestore?: () => void }).mockRestore?.();
    (logger.warn as unknown as { mockRestore?: () => void }).mockRestore?.();
  });

  /** A mapped client; `slot` > 0 makes a further client with its own clone, Monerium profile and manager. */
  async function mappedAccount(slot = 0) {
    const manager = await createTestUser();
    await ManagedProfileManager.create({
      allowedCorridors: ["EU"],
      allowedCustomerTypes: ["business"],
      isActive: true,
      profileId: manager.id
    });
    return provisionMoneriumB2bAccount({
      contactEmail: slot === 0 ? "ops@client.example.com" : `ops${slot}@client.example.com`,
      destination: DESTINATION,
      externalSubjectId: `client-${slot + 1}`,
      forwarderAddress: slot === 0 ? FORWARDER : `0x${(4 + slot).toString(16).repeat(40)}`,
      managerProfileId: manager.id,
      moneriumProfileId: slot === 0 ? "0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6e" : `0b8e7c2a-8f4e-4d43-9f2b-2f9f3c1d5a6${slot}`
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
    expect(await activeRecoveryExists(accountId)).toBe(true);

    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const deps = fakeDeps(ledger, {
      setDepositStatus: async (row, status) => {
        await row.update({ status });
        return null;
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
    expect(await activeRecoveryExists(accountId)).toBe(true);

    deps.orders[0].state = "processed";
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    await deposit.reload();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.Refunded);
    expect(await activeRecoveryExists(accountId)).toBe(false);
  });

  it("parks a refund whose redeem keeps failing after five cycles, and gives an operator retry five more", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "refused", new Date(), MoneriumFiatDepositStatus.Recovering);
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
    let redeemCalls = 0;
    const deps = fakeDeps(ledger, {
      createRedeemOrder: async () => {
        redeemCalls += 1;
        throw new Error("Request failed with status '400'");
      },
      setDepositStatus: async (row, status) => {
        await row.update({ status });
      }
    });
    const depsFor = async () => deps;
    await runRecoveryOrchestrator(depsFor); // opens the row: moved -> swapped
    await runRecoveryOrchestrator(depsFor); // exact balance: topped up
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;

    for (let cycle = 1; cycle <= 4; cycle++) {
      await runRecoveryOrchestrator(depsFor);
      await recovery.reload();
      await deposit.reload();
      expect(recovery).toMatchObject({ attempts: cycle, error: null, phase: MoneriumRecoveryPhase.ToppedUp });
      expect(deposit.status).toBe(MoneriumFiatDepositStatus.Recovering);
    }
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(recovery.attempts).toBe(5);
    expect(recovery.error).toContain("after 5 attempts");
    await runRecoveryOrchestrator(depsFor); // parked: no further call to Monerium
    expect(redeemCalls).toBe(5);

    // The operator sets it back to recovering: a fresh run of attempts from the preserved phase.
    await deposit.update({ status: MoneriumFiatDepositStatus.Recovering });
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    expect(recovery).toMatchObject({ attempts: 1, error: null, phase: MoneriumRecoveryPhase.ToppedUp });
    expect(redeemCalls).toBe(6);
  });

  it("keeps counting attempts when parking a failed refund is refused, instead of reading it as an operator retry", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "unparked", new Date(), MoneriumFiatDepositStatus.Recovering);
    await MoneriumRecovery.create({
      attempts: 4,
      depositId: deposit.id,
      eureRecoveredRaw: (100n * EUR).toString(),
      phase: MoneriumRecoveryPhase.ToppedUp,
      usdcRecoveredRaw: "0"
    });
    let park: () => Promise<string | null> = async () => "Monerium account not found";
    const deps = fakeDeps(
      { eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() },
      {
        createRedeemOrder: async () => {
          throw new Error("Request failed with status '503'");
        },
        setDepositStatus: () => park()
      }
    );
    const depsFor = async () => deps;
    const error = spyOn(logger, "error");
    // Scoped to this deposit: another file's leaked logger mock can carry earlier calls into the spy.
    const refundFailedLogs = () =>
      error.mock.calls.filter(([message]) => String(message).includes(`REFUND FAILED — deposit ${deposit.id}`)).length;
    try {
      await runRecoveryOrchestrator(depsFor); // fifth failure: parking refused
      const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
      expect(recovery).toMatchObject({ attempts: 5, error: null });

      park = async () => {
        throw new Error("connection reset");
      };
      await runRecoveryOrchestrator(depsFor); // no reset to a fresh run of five; parking throws
      await recovery.reload();
      expect(recovery).toMatchObject({ attempts: 6, error: null });

      await runRecoveryOrchestrator(depsFor);
      await recovery.reload();
      await deposit.reload();
      expect(recovery).toMatchObject({ attempts: 7, error: null });
      expect(deposit.status).toBe(MoneriumFiatDepositStatus.Recovering);
      expect(refundFailedLogs()).toBe(0); // the deposit is still driven: nothing for the operator yet

      park = async () => {
        await deposit.update({ status: MoneriumFiatDepositStatus.RecoveryFailed });
        return null;
      };
      await runRecoveryOrchestrator(depsFor);
      await recovery.reload();
      expect(recovery.error).toContain("after 8 attempts");
      expect(refundFailedLogs()).toBe(1);
    } finally {
      error.mockRestore();
    }
  });

  it("closes a parked EUR 15,000+ refund the operator completed by hand, without placing a redeem order", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "large", new Date(), MoneriumFiatDepositStatus.Recovering);
    await deposit.update({ amountRaw: (20_000n * EUR).toString() });
    await MoneriumConversionExecution.create({
      accountId,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: (20_000n * EUR).toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: "0xrecover",
      usdcNetRaw: "0"
    });
    const deps = fakeDeps({ eure: new Map([[RECOVERY, 20_000n * EUR]]), usdc: new Map() }, { setDepositStatus });
    const depsFor = async () => deps;
    for (let i = 0; i < 3; i++) await runRecoveryOrchestrator(depsFor); // moved -> swapped -> topped up -> parked
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery).toMatchObject({ error: expect.stringContaining("supporting document"), phase: MoneriumRecoveryPhase.ToppedUp });

    // The operator places the order by hand and closes the deposit (PATCH .../status {"status": "refunded"}).
    expect(await setDepositStatus(deposit, MoneriumFiatDepositStatus.Refunded)).toBeNull();
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    await deposit.reload();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.Refunded);
    expect(deps.calls.some(call => call.startsWith("redeem:"))).toBe(false);
    expect(await activeRecoveryExists()).toBe(false);
  });

  it("re-parks a rejected redeem order on an operator retry, and a hand close never reports it", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await minted(accountId, "rejected", new Date(), MoneriumFiatDepositStatus.Recovering);
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
    const deps = fakeDeps({ eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() }, { setDepositStatus });
    const depsFor = async () => deps;
    for (let i = 0; i < 3; i++) await runRecoveryOrchestrator(depsFor); // moved -> swapped -> topped up -> order placed
    Object.assign(deps.orders[0], { rejectedReason: "compliance", state: "rejected" });
    await runRecoveryOrchestrator(depsFor);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.Redeeming, redeemOrderId: null });
    expect(recovery.error).toContain("order-1: compliance");

    // A retry cannot get past a rejected order: the memo lookup adopts it again and it parks again.
    expect(await setDepositStatus(deposit, MoneriumFiatDepositStatus.Recovering)).toBeNull();
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(recovery.redeemOrderId).toBeNull();

    // Refunded by hand and closed: DEPOSIT_RETURNED reads no order id rather than the rejected one.
    expect(await setDepositStatus(deposit, MoneriumFiatDepositStatus.Refunded)).toBeNull();
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    expect(recovery).toMatchObject({ phase: MoneriumRecoveryPhase.Redeemed, redeemOrderId: null });
    expect(deps.calls.filter(call => call.startsWith("redeem:"))).toHaveLength(1);
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
        return null;
      }
    });
    const depsFor = async () => deps;
    for (let i = 0; i < 3; i++) await runRecoveryOrchestrator(depsFor);
    await deposit.reload();
    expect(deposit.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery.error).toContain("payer IBAN");
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
    expect(await activeRecoveryExists(accountId)).toBe(true);

    // Operator fixes the payer and retries: the run resumes from the preserved phase.
    await deposit.update({ payerIban: "DE89370400440532013000", status: MoneriumFiatDepositStatus.Recovering });
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    expect(recovery.error).toBeNull();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeeming);
  });

  // ---------------------------------------------------------------- one client's refund queue
  // Characterization of the behaviour that must survive per-client concurrency: within one
  // client, refunds run oldest first, one at a time, and a parked refund holds that client's queue.

  const SECOND = "second";

  async function confirmedRecover(
    accountId: string,
    orderId: string,
    mintedAt: Date,
    recovered: { eure: bigint; usdc: bigint } = { eure: 100n * EUR, usdc: 0n }
  ) {
    const deposit = await minted(accountId, orderId, mintedAt, MoneriumFiatDepositStatus.Recovering);
    await MoneriumConversionExecution.create({
      accountId,
      createdAt: mintedAt,
      depositId: deposit.id,
      destination: DESTINATION,
      eureInRaw: recovered.eure.toString(),
      kind: MoneriumConversionExecutionKind.Recover,
      status: MoneriumConversionExecutionStatus.Confirmed,
      txHash: `0xrecover-${orderId}`,
      usdcNetRaw: recovered.usdc.toString()
    });
    return deposit;
  }

  function dbDeps(ledger: Ledger, overrides: Parameters<typeof fakeDeps>[1] = {}) {
    return fakeDeps(ledger, {
      setDepositStatus: async (row, status) => {
        await row.update({ status });
      },
      ...overrides
    });
  }

  async function runUntilRedeemed(depsFor: () => Promise<RecoveryDeps>, recovery: MoneriumRecovery, deps: ReturnType<typeof fakeDeps>) {
    for (let i = 0; i < 8 && recovery.phase !== MoneriumRecoveryPhase.Redeeming; i++) {
      await runRecoveryOrchestrator(depsFor);
      await recovery.reload();
    }
    deps.orders[0].state = "processed";
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
  }

  it("opens one client's refunds oldest first and the next only after the previous is redeemed", async () => {
    const { accountId } = await mappedAccount();
    const now = Date.now();
    const older = await confirmedRecover(accountId, "older", new Date(now - 60_000));
    const newer = await confirmedRecover(accountId, SECOND, new Date(now - 30_000));
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const deps = dbDeps(ledger);
    const depsFor = async () => deps;

    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count()).toBe(1);
    const first = (await MoneriumRecovery.findOne({ where: { depositId: older.id } })) as MoneriumRecovery;
    expect(first).not.toBeNull();
    await runRecoveryOrchestrator(depsFor);
    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: newer.id } })).toBe(0);

    await runUntilRedeemed(depsFor, first, deps);
    expect(first.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(await MoneriumRecovery.count({ where: { depositId: newer.id } })).toBe(0);

    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: newer.id } })).toBe(1);
  });

  it("holds a client's later refund behind its parked one until the operator retries", async () => {
    const { accountId } = await mappedAccount();
    const now = Date.now();
    const parked = await confirmedRecover(accountId, "parked", new Date(now - 60_000));
    await parked.update({ payerIban: null });
    const later = await confirmedRecover(accountId, "later", new Date(now - 30_000));
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const deps = dbDeps(ledger);
    const depsFor = async () => deps;

    for (let i = 0; i < 6; i++) await runRecoveryOrchestrator(depsFor);
    await parked.reload();
    expect(parked.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    expect(await MoneriumRecovery.count({ where: { depositId: later.id } })).toBe(0);

    await parked.update({ payerIban: "DE89370400440532013000", status: MoneriumFiatDepositStatus.Recovering });
    const first = (await MoneriumRecovery.findOne({ where: { depositId: parked.id } })) as MoneriumRecovery;
    await runUntilRedeemed(depsFor, first, deps);
    expect(first.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: later.id } })).toBe(1);
  });

  it("closes the recovery of a deposit an operator refunded by hand without driving it", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await confirmedRecover(accountId, "by-hand", new Date());
    const deps = dbDeps({ eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() });
    const depsFor = async () => deps;
    await runRecoveryOrchestrator(depsFor); // opens and advances one step
    await deposit.update({ status: MoneriumFiatDepositStatus.Refunded });
    const calls = deps.calls.length;
    await runRecoveryOrchestrator(depsFor);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    expect(deps.calls.length).toBe(calls);
  });

  it("advances an opened recovery by one step per cycle with at most one reverse swap", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await confirmedRecover(accountId, "chunked", new Date());
    await MoneriumConversionExecution.update(
      { eureInRaw: (40n * EUR).toString(), usdcNetRaw: (68n * USDC).toString() },
      { where: { depositId: deposit.id } }
    );
    const ledger: Ledger = { eure: new Map([[RECOVERY, 40n * EUR]]), usdc: new Map([[RECOVERY, 68n * USDC]]) };
    const deps = dbDeps(ledger, { swapOut: 59n * EUR });
    const depsFor = async () => deps;

    await runRecoveryOrchestrator(depsFor);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapping);
    expect(deps.calls.filter(call => call.startsWith("swap:"))).toHaveLength(1);
    await runRecoveryOrchestrator(depsFor);
    await recovery.reload();
    expect(recovery.phase).toBe(MoneriumRecoveryPhase.Swapped);
    expect(deps.calls.filter(call => call.startsWith("swap:"))).toHaveLength(1);
  });

  it("counts only pending or confirmed recovers of deposits still on the refund path as in flight", async () => {
    const { accountId } = await mappedAccount();
    const deposit = await confirmedRecover(accountId, "in-flight", new Date());
    expect(await activeRecoveryExists(accountId)).toBe(true);
    await MoneriumConversionExecution.update({ status: MoneriumConversionExecutionStatus.Pending }, { where: { depositId: deposit.id } });
    expect(await activeRecoveryExists(accountId)).toBe(true);
    await MoneriumConversionExecution.update({ status: MoneriumConversionExecutionStatus.Failed }, { where: { depositId: deposit.id } });
    expect(await activeRecoveryExists(accountId)).toBe(false);
    await MoneriumConversionExecution.update({ status: MoneriumConversionExecutionStatus.Confirmed }, { where: { depositId: deposit.id } });
    await deposit.update({ status: MoneriumFiatDepositStatus.Refunded });
    expect(await activeRecoveryExists(accountId)).toBe(false);
  });


  // ---------------------------------------------------------------- several clients

  const WALLETS = [RECOVERY, "0x9999999999999999999999999999999999999999" as Address];

  /** One orchestrator cycle over several clients: every client's refund wallet is its own, the float and the call log shared. */
  function clientsFixture(ledger: Ledger, overrides: Parameters<typeof fakeDeps>[1] = {}) {
    const calls: string[] = [];
    const orders: Array<{ id: string; memo: string; rejectedReason?: string; state: string }> = [];
    const depsFor = async (account: MoneriumAccount) => {
      const slot = account.forwarderAddress.toLowerCase() === FORWARDER ? 0 : 1;
      return dbDeps(ledger, {
        calls,
        createRedeemOrder: async request => {
          calls.push(`redeem:${slot}`);
          orders.push({ id: `order-${request.memo}`, memo: request.memo as string, state: "placed" });
          return { id: `order-${request.memo}` };
        },
        orders,
        recoveryWallet: WALLETS[slot],
        ...overrides
      });
    };
    return { calls, depsFor, orders };
  }

  it("progresses two clients' refunds in the same cycles", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const now = Date.now();
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(now - 60_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(now - 30_000));
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    const { depsFor, orders } = clientsFixture(ledger);
    const phases = async () => [
      (await MoneriumRecovery.findOne({ where: { depositId: depositA.id } }))?.phase,
      (await MoneriumRecovery.findOne({ where: { depositId: depositB.id } }))?.phase
    ];

    await runRecoveryOrchestrator(depsFor);
    expect(await phases()).toEqual([MoneriumRecoveryPhase.Swapped, MoneriumRecoveryPhase.Swapped]);
    await runRecoveryOrchestrator(depsFor);
    expect(await phases()).toEqual([MoneriumRecoveryPhase.ToppedUp, MoneriumRecoveryPhase.ToppedUp]);
    await runRecoveryOrchestrator(depsFor);
    expect(await phases()).toEqual([MoneriumRecoveryPhase.Redeeming, MoneriumRecoveryPhase.Redeeming]);
    for (const order of orders) order.state = "processed";
    await runRecoveryOrchestrator(depsFor);
    expect(await phases()).toEqual([MoneriumRecoveryPhase.Redeemed, MoneriumRecoveryPhase.Redeemed]);
    await depositA.reload();
    await depositB.reload();
    expect([depositA.status, depositB.status]).toEqual([MoneriumFiatDepositStatus.Refunded, MoneriumFiatDepositStatus.Refunded]);
  });

  it("lets a client's parked refund block only that client", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const now = Date.now();
    const parked = await confirmedRecover(a.accountId, "a-parked", new Date(now - 90_000));
    await parked.update({ payerIban: null });
    const laterA = await confirmedRecover(a.accountId, "a-later", new Date(now - 60_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(now - 30_000));
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    const { depsFor, orders } = clientsFixture(ledger);

    for (let i = 0; i < 4; i++) await runRecoveryOrchestrator(depsFor);
    await parked.reload();
    expect(parked.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
    const recoveryB = (await MoneriumRecovery.findOne({ where: { depositId: depositB.id } })) as MoneriumRecovery;
    expect(recoveryB.phase).toBe(MoneriumRecoveryPhase.Redeeming);

    orders.find(order => order.memo === refundMemo(depositB.id))!.state = "processed";
    await runRecoveryOrchestrator(depsFor);
    await recoveryB.reload();
    expect(recoveryB.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    // Client A's second refund still waits behind its parked one.
    expect(await MoneriumRecovery.count({ where: { depositId: laterA.id } })).toBe(0);
  });

  it("opens each client's next refund independently of the other client's open one", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const now = Date.now();
    const a1 = await confirmedRecover(a.accountId, "a1", new Date(now - 90_000));
    const b1 = await confirmedRecover(b.accountId, "b1", new Date(now - 80_000));
    const b2 = await confirmedRecover(b.accountId, "b2", new Date(now - 70_000));
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR]]), usdc: new Map() };
    const { depsFor } = clientsFixture(ledger);

    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: a1.id } })).toBe(1);
    expect(await MoneriumRecovery.count({ where: { depositId: b1.id } })).toBe(1);
    expect(await MoneriumRecovery.count({ where: { depositId: b2.id } })).toBe(0);
  });

  /** An already open recovery, with an explicit age so the oldest-first order does not depend on clock ticks. */
  function openRecovery(depositId: string, phase: MoneriumRecoveryPhase, ageMs: number, recovered = { eure: 99n * EUR, usdc: 0n }) {
    return MoneriumRecovery.create({
      createdAt: new Date(Date.now() - ageMs),
      depositId,
      eureRecoveredRaw: recovered.eure.toString(),
      phase,
      usdcRecoveredRaw: recovered.usdc.toString()
    });
  }

  /** Two clients whose refunds are 1 EURe short on their wallets: each needs a float top-up. */
  async function twoClientsNeedingTopUps() {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000), { eure: 99n * EUR, usdc: 0n });
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 99n * EUR, usdc: 0n });
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Swapped, 60_000);
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 99n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    return { depositA, depositB, ledger };
  }

  it("sends from the float for at most one client per cycle, oldest first", async () => {
    const { ledger } = await twoClientsNeedingTopUps();
    const { calls, depsFor } = clientsFixture(ledger);
    const floatSends = () => calls.filter(call => call.startsWith("eure:float"));

    await runRecoveryOrchestrator(depsFor); // the older client tops up; the other waits for the next cycle
    expect(floatSends()).toEqual([`eure:float->${WALLETS[0].toLowerCase()}:${EUR}`]);
    await runRecoveryOrchestrator(depsFor); // the first confirms, then the second tops up
    expect(floatSends()).toEqual([
      `eure:float->${WALLETS[0].toLowerCase()}:${EUR}`,
      `eure:float->${WALLETS[1].toLowerCase()}:${EUR}`
    ]);
  });

  it("starts no float send while another client's float transfer is still unconfirmed", async () => {
    const { ledger } = await twoClientsNeedingTopUps();
    let receiptTimesOut = false;
    const { calls, depsFor } = clientsFixture(ledger, {
      waitReceipt: async () => {
        if (receiptTimesOut) throw new Error("timed out waiting for the receipt");
        return "success";
      }
    });
    const floatSends = () => calls.filter(call => call.startsWith("eure:float"));

    await runRecoveryOrchestrator(depsFor); // client A's top-up goes out
    expect(floatSends()).toHaveLength(1);
    receiptTimesOut = true;
    await runRecoveryOrchestrator(depsFor); // its receipt cannot be read: client B must not send from the float
    await runRecoveryOrchestrator(depsFor);
    expect(floatSends()).toHaveLength(1);
    receiptTimesOut = false;
    await runRecoveryOrchestrator(depsFor); // confirmed: B may go
    expect(floatSends()).toHaveLength(2);
  });

  it("counts a reverse swap's gas top-up against the same float slot as a top-up", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000), { eure: 40n * EUR, usdc: 68n * USDC });
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 99n * EUR, usdc: 0n });
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Moved, 60_000, { eure: 40n * EUR, usdc: 68n * USDC });
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 40n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 100n * EUR]]),
      usdc: new Map([[WALLETS[0], 68n * USDC]])
    };
    const { calls, depsFor } = clientsFixture(ledger, { swapOut: 59n * EUR });

    await runRecoveryOrchestrator(depsFor); // A swaps; B's top-up waits
    expect(calls).toHaveLength(1);
    expect(calls[0]).toStartWith("swap:");
    await runRecoveryOrchestrator(depsFor); // A's swap confirms (no float), then B tops up
    expect(calls.slice(1)).toEqual([`eure:float->${WALLETS[1].toLowerCase()}:${EUR}`]);
  });

  it("does not let a client whose float step sends nothing hold the float slot", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000), { eure: 99n * EUR, usdc: 0n });
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 40n * EUR, usdc: 68n * USDC });
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Swapped, 60_000);
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Moved, 30_000, { eure: 40n * EUR, usdc: 68n * USDC });
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 99n * EUR], [WALLETS[1], 40n * EUR], [FLOAT, 0n]]),
      usdc: new Map([[WALLETS[1], 68n * USDC]])
    };
    const { calls, depsFor } = clientsFixture(ledger, { swapOut: 59n * EUR });

    await runRecoveryOrchestrator(depsFor); // the older client waits for an empty float without sending; the younger swaps
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([]);
    expect(calls.filter(call => call.startsWith("swap:"))).toHaveLength(1);
  });

  it("starts no further step once a cycle has used up its time budget", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000));
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Moved, 60_000, { eure: 100n * EUR, usdc: 0n });
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Moved, 30_000, { eure: 100n * EUR, usdc: 0n });
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR]]), usdc: new Map() };
    const { depsFor } = clientsFixture(ledger);
    try {
      // The older client's step takes two minutes.
      await runRecoveryOrchestrator(async account => {
        const deps = await depsFor(account);
        setSystemTime(new Date(Date.now() + 120_000));
        return deps;
      });
    } finally {
      setSystemTime();
    }
    expect((await MoneriumRecovery.findOne({ where: { depositId: depositA.id } }))?.phase).toBe(MoneriumRecoveryPhase.Swapped);
    expect((await MoneriumRecovery.findOne({ where: { depositId: depositB.id } }))?.phase).toBe(MoneriumRecoveryPhase.Moved);
  });

  it("counts a surplus sweep to the float against the same float slot as a top-up", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000), { eure: 103n * EUR, usdc: 0n });
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 99n * EUR, usdc: 0n });
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Swapped, 60_000, { eure: 103n * EUR, usdc: 0n });
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 103n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    const { calls, depsFor } = clientsFixture(ledger);

    await runRecoveryOrchestrator(depsFor); // A sweeps its surplus to the float; B's top-up waits
    expect(calls).toEqual([`eure:recovery->${FLOAT.toLowerCase()}:${3n * EUR}`]);
    await runRecoveryOrchestrator(depsFor); // the sweep confirms (no float send), then B tops up
    expect(calls.slice(1)).toEqual([`eure:float->${WALLETS[1].toLowerCase()}:${EUR}`]);
  });

  it("steps a client once per cycle: a float-free step that just failed is not picked up again by the float stage", async () => {
    const g = await mappedAccount(0);
    const a = await mappedAccount(1);
    const depositG = await confirmedRecover(g.accountId, "g1", new Date(Date.now() - 90_000));
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 80_000), { eure: 40n * EUR, usdc: 68n * USDC });
    // G's float transfer landed, so its (slow) receipt wait gates the float stage.
    await openRecovery(depositG.id, MoneriumRecoveryPhase.ToppingUp, 60_000, { eure: 99n * EUR, usdc: 0n }).then(row =>
      row.update({ floatTopupTxHash: "0xlanded" })
    );
    // A's fifth swap attempt reverts: it is parked, and nothing more may be sent for it.
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Swapping, 30_000, { eure: 40n * EUR, usdc: 68n * USDC }).then(row =>
      row.update({ attempts: 4, reverseSwapTxHash: "0xbad" })
    );
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 40n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map([[WALLETS[1], 68n * USDC]])
    };
    const { calls, depsFor } = clientsFixture(ledger, {
      receipts: { "0xbad": "reverted" },
      setDepositStatus // the live one: it updates a separate instance, so the cycle's own deposit object goes stale
    });

    await runRecoveryOrchestrator(async account => {
      const deps = await depsFor(account);
      if (account.forwarderAddress.toLowerCase() !== FORWARDER) return deps;
      return {
        ...deps,
        waitReceipt: async hash => {
          await new Promise(resolve => setTimeout(resolve, 200)); // A's step is long done when this returns
          return deps.waitReceipt(hash);
        }
      };
    });

    expect(calls.filter(call => call.startsWith("swap:") || call.startsWith("eure:"))).toEqual([]);
    const recovery = (await MoneriumRecovery.findOne({ where: { depositId: depositA.id } })) as MoneriumRecovery;
    expect(recovery).toMatchObject({ attempts: 5, phase: MoneriumRecoveryPhase.Moved });
    expect(recovery.error).toContain("after 5 attempts");
    await depositA.reload();
    expect(depositA.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);
  });

  it("starts no float step after a float-free step has used up the cycle's time budget", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000));
    // A's float transfer already landed, so its (slow) receipt step gates the float stage and then releases it.
    await openRecovery(depositA.id, MoneriumRecoveryPhase.ToppingUp, 60_000, { eure: 99n * EUR, usdc: 0n }).then(row =>
      row.update({ floatTopupTxHash: "0xlanded" })
    );
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    const { calls, depsFor } = clientsFixture(ledger);
    try {
      await runRecoveryOrchestrator(async account => {
        const deps = await depsFor(account);
        if (account.forwarderAddress.toLowerCase() !== FORWARDER) return deps;
        return {
          ...deps,
          waitReceipt: async hash => {
            setSystemTime(new Date(Date.now() + 120_000)); // the receipt wait takes two minutes
            return deps.waitReceipt(hash);
          }
        };
      });
    } finally {
      setSystemTime();
    }
    expect((await MoneriumRecovery.findOne({ where: { depositId: depositA.id } }))?.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
    expect(calls).toEqual([]); // B's top-up did not start

    await runRecoveryOrchestrator(depsFor); // a fresh cycle has its full budget
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([`eure:float->${WALLETS[1].toLowerCase()}:${EUR}`]);
  });

  describe("keeper wiring of the in-flight recover", () => {
    afterEach(() => {
      for (const spy of spies) spy.mockRestore();
      spies.length = 0;
    });
    const spies: Array<{ mockRestore(): void }> = [];

    it("refuses a second recover only for the account whose refund is in flight", async () => {
      const a = await mappedAccount(0);
      const b = await mappedAccount(1);
      const now = Date.now();
      const inFlight = await confirmedRecover(a.accountId, "a1", new Date(now - 90_000)); // A's refund holds its wallet
      const waitingA = await minted(a.accountId, "a2", new Date(now - 80_000), MoneriumFiatDepositStatus.Recovering);
      const waitingB = await minted(b.accountId, "b1", new Date(now - 70_000), MoneriumFiatDepositStatus.Recovering);
      await waitingA.update({ blockNumber: 101 });
      await waitingB.update({ blockNumber: 102 });
      expect(await activeRecoveryExists(a.accountId)).toBe(true);

      const reads: Record<string, unknown> = {
        MIN_SWAP_FLOOR: 1n,
        balanceOf: 100n * EUR,
        batchOpenedAt: 1_000n, // long past the recovery delay
        minSwapAmount: 25n * EUR,
        perSwapCap: 10_000n * EUR
      };
      spies.push(
        spyOn(chain, "getPublicClient").mockReturnValue({
          readContract: async ({ functionName }: { functionName: string }) => reads[functionName]
        } as unknown as ReturnType<typeof chain.getPublicClient>),
        spyOn(chain, "getForwarderImmutables").mockResolvedValue({
          factory: config.moneriumB2b.forwarderFactoryAddress,
          recoveryDelaySeconds: 7_200
        } as unknown as chain.ForwarderImmutables),
        // No keeper in tests: a recover that gets as far as its send fails right after its row is reserved.
        spyOn(chain, "getKeeperWalletClient").mockImplementation(() => {
          throw new Error("no keeper in tests");
        })
      );
      const recoversOf = (depositId: string) =>
        MoneriumConversionExecution.count({ where: { depositId, kind: MoneriumConversionExecutionKind.Recover } });

      await runConversionExecutor(a.accountId);
      await runConversionExecutor(b.accountId);

      expect(await recoversOf(inFlight.id)).toBe(1);
      expect(await recoversOf(waitingA.id)).toBe(0); // refused: A's previous refund is still on its wallet
      expect(await recoversOf(waitingB.id)).toBe(1); // B has no refund in flight: planned and attempted
    });
  });

  it("opens a refund confirmed later while another client's refund is already parked", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const parked = await confirmedRecover(a.accountId, "a-parked", new Date(Date.now() - 90_000));
    await parked.update({ payerIban: null });
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const { depsFor } = clientsFixture(ledger);

    for (let i = 0; i < 4; i++) await runRecoveryOrchestrator(depsFor);
    await parked.reload();
    expect(parked.status).toBe(MoneriumFiatDepositStatus.RecoveryFailed);

    const later = await confirmedRecover(b.accountId, "b-later", new Date());
    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: later.id } })).toBe(1);
    await runRecoveryOrchestrator(depsFor);
    const laterRecovery = (await MoneriumRecovery.findOne({ where: { depositId: later.id } })) as MoneriumRecovery;
    expect(laterRecovery.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
    expect(laterRecovery.error).toBeNull();
  });

  it("lets a younger client's refund advance while the oldest client's receipt wait hangs", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000));
    await openRecovery(depositA.id, MoneriumRecoveryPhase.Swapping, 60_000).then(row => row.update({ reverseSwapTxHash: "0xstuck" }));
    await openRecovery(depositB.id, MoneriumRecoveryPhase.ToppedUp, 30_000, { eure: 100n * EUR, usdc: 0n });
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR]]), usdc: new Map() };
    const { depsFor } = clientsFixture(ledger);
    const phaseOf = async (depositId: string) => (await MoneriumRecovery.findOne({ where: { depositId } }))?.phase;

    // Client A's swap receipt never arrives within the cycle (the live wait throws only after RECEIPT_TIMEOUT_MS).
    await cycleWithHungReceiptOfA(depsFor, async () => {
      await waitUntil(async () => (await phaseOf(depositB.id)) !== MoneriumRecoveryPhase.ToppedUp);
      expect(await phaseOf(depositB.id)).toBe(MoneriumRecoveryPhase.Redeeming);
      expect(await phaseOf(depositA.id)).toBe(MoneriumRecoveryPhase.Swapping);
    });
  });

  it("does not let a parked refund's unconfirmed float transfer hold the float for other clients", async () => {
    const { depositA, depositB, ledger } = await twoClientsNeedingTopUps();
    const recoveryA = (await MoneriumRecovery.findOne({ where: { depositId: depositA.id } })) as MoneriumRecovery;
    // An operator parked client A's refund while its float top-up was in flight: the phase never advances.
    await recoveryA.update({ error: "parked by hand", floatTopupTxHash: "0xhash", phase: MoneriumRecoveryPhase.ToppingUp });
    await depositA.update({ status: MoneriumFiatDepositStatus.RecoveryFailed });
    const { calls, depsFor } = clientsFixture(ledger);

    await runRecoveryOrchestrator(depsFor);
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([`eure:float->${WALLETS[1].toLowerCase()}:${EUR}`]);
    expect((await MoneriumRecovery.findOne({ where: { depositId: depositB.id } }))?.phase).toBe(MoneriumRecoveryPhase.ToppingUp);
  });

  /**
   * Client A's float top-up gates the float stage for client B's float top-up. By default A's receipt never
   * confirms (its wait times out), so the float stage stays closed to float-capable steps.
   */
  async function floatGateClosedByA(
    waitReceipt: () => Promise<"success"> = async () => {
      throw new Error("timed out waiting for the receipt");
    }
  ) {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000), { eure: 99n * EUR, usdc: 0n });
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 99n * EUR, usdc: 0n });
    await openRecovery(depositA.id, MoneriumRecoveryPhase.ToppingUp, 60_000).then(row => row.update({ floatTopupTxHash: "0xlanded" }));
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = {
      eure: new Map([[WALLETS[0], 99n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 10n * EUR]]),
      usdc: new Map()
    };
    const fixture = clientsFixture(ledger, { waitReceipt });
    return { ...fixture, a, b, depositA, depositB };
  }

  const loggedText = (spy: { mock: { calls: unknown[][] } }) => spy.mock.calls.map(call => String(call[0])).join("\n");

  it("names the deposit whose unconfirmed float transfer holds the float stage", async () => {
    const { calls, depositA, depsFor } = await floatGateClosedByA();
    const warns = spyOn(logger, "warn").mockImplementation((() => logger) as never);
    spyOn(logger, "error").mockImplementation((() => logger) as never);

    await runRecoveryOrchestrator(depsFor);
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([]);
    expect(loggedText(warns)).toContain(depositA.id);
  });

  it("keeps a float-phase refund behind a closed float gate whatever its deposit status, short of parked or refunded", async () => {
    const { calls, depositB, depsFor } = await floatGateClosedByA();
    await depositB.update({ status: MoneriumFiatDepositStatus.Converting }); // a hand edit outside the lattice
    spyOn(logger, "warn").mockImplementation((() => logger) as never);
    spyOn(logger, "error").mockImplementation((() => logger) as never);

    await runRecoveryOrchestrator(depsFor);
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([]);
  });

  it("logs no float-gate warning when the only unconfirmed float transfer belongs to a parked refund", async () => {
    const { depositA, depsFor } = await floatGateClosedByA();
    await depositA.update({ status: MoneriumFiatDepositStatus.RecoveryFailed });
    const warns = spyOn(logger, "warn").mockImplementation((() => logger) as never);
    spyOn(logger, "error").mockImplementation((() => logger) as never);

    await runRecoveryOrchestrator(depsFor);
    expect(loggedText(warns)).not.toContain(depositA.id);
  });

  it("closes a refunded client's recovery and opens its next one while another client's float gate is closed", async () => {
    const { b, depositB, depsFor } = await floatGateClosedByA();
    spyOn(logger, "error").mockImplementation((() => logger) as never);
    await depositB.update({ status: MoneriumFiatDepositStatus.Refunded }); // closed by hand
    const next = await confirmedRecover(b.accountId, "b2", new Date(Date.now() - 70_000));

    await runRecoveryOrchestrator(depsFor);
    expect((await MoneriumRecovery.findOne({ where: { depositId: depositB.id } }))?.phase).toBe(MoneriumRecoveryPhase.Redeemed);
    await runRecoveryOrchestrator(depsFor);
    expect(await MoneriumRecovery.count({ where: { depositId: next.id } })).toBe(1);
  });

  it("still reports a parked client's refund while another client's float gate is closed", async () => {
    const { depositB, depsFor } = await floatGateClosedByA();
    await depositB.update({ status: MoneriumFiatDepositStatus.RecoveryFailed });
    await MoneriumRecovery.update({ error: "parked by hand" }, { where: { depositId: depositB.id } });
    const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);

    await runRecoveryOrchestrator(depsFor);
    expect(loggedText(errors)).toContain(`refund of deposit ${depositB.id} waits for the operator`);
  });

  it.each([
    ["parks its deposit", (depositId: string) => MoneriumFiatDeposit.update({ status: MoneriumFiatDepositStatus.RecoveryFailed }, { where: { id: depositId } })],
    ["moves its phase on", (depositId: string) => MoneriumRecovery.update({ phase: MoneriumRecoveryPhase.ToppedUp }, { where: { depositId } })]
  ])("sends nothing for a float step whose refund an operator %s while the cycle waited on the float gate", async (_name, change) => {
    let depositBId = "";
    // A's receipt wait gates the float stage; the operator acts on B's refund while it runs.
    const { calls, depositB, depsFor } = await floatGateClosedByA(async () => {
      await change(depositBId);
      return "success";
    });
    depositBId = depositB.id;
    spyOn(logger, "error").mockImplementation((() => logger) as never);

    await runRecoveryOrchestrator(depsFor);
    expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([]);
  });

  it("skips a float step whose refund cannot be reloaded after the float gate and finishes the cycle", async () => {
    const { calls, depositB, depsFor } = await floatGateClosedByA(async () => "success");
    const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);
    const reload = MoneriumFiatDeposit.prototype.reload;
    const failing = spyOn(MoneriumFiatDeposit.prototype, "reload").mockImplementation(function (this: MoneriumFiatDeposit) {
      return this.id === depositB.id ? Promise.reject(new Error("connection lost")) : reload.call(this);
    } as never);
    try {
      await runRecoveryOrchestrator(depsFor);
      expect(calls.filter(call => call.startsWith("eure:float"))).toEqual([]);
      expect(loggedText(errors)).toContain(`could not reload the refund of deposit ${depositB.id}`);
    } finally {
      failing.mockRestore(); // the model's prototype is shared with the other tests
    }
  });

  it("keeps stepping the other clients when opening one client's refund fails", async () => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const poisoned = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000));
    await openRecovery(depositB.id, MoneriumRecoveryPhase.ToppedUp, 30_000, { eure: 100n * EUR, usdc: 0n });
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR]]), usdc: new Map() };
    const { depsFor } = clientsFixture(ledger);
    const create = MoneriumRecovery.create.bind(MoneriumRecovery);
    const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);
    const insert = spyOn(MoneriumRecovery, "create").mockImplementation(((values: { depositId: string }) =>
      values.depositId === poisoned.id ? Promise.reject(new Error("insert failed")) : create(values as never)) as never);
    try {
      await runRecoveryOrchestrator(depsFor);
      expect((await MoneriumRecovery.findOne({ where: { depositId: depositB.id } }))?.phase).toBe(MoneriumRecoveryPhase.Redeeming);
      expect(loggedText(errors)).toContain(poisoned.id);
    } finally {
      insert.mockRestore(); // the model's create is shared with the other tests
    }
  });

  /** Runs a cycle in which client A's receipt wait hangs; `check` runs while it is unresolved, then A is released. */
  async function cycleWithHungReceiptOfA(depsFor: ReturnType<typeof clientsFixture>["depsFor"], check: () => Promise<void>) {
    let release: () => void = () => {};
    const hung = new Promise<void>(resolve => (release = resolve));
    const cycle = runRecoveryOrchestrator(async account => {
      const deps = await depsFor(account);
      return account.forwarderAddress.toLowerCase() === FORWARDER
        ? { ...deps, waitReceipt: async () => (await hung, Promise.reject(new Error("timed out waiting for the receipt"))) }
        : deps;
    });
    try {
      await check();
    } finally {
      release();
      await cycle;
    }
  }

  /** Polls until the condition holds; the deadline is generous because database-backed steps are slow on a loaded runner. */
  async function waitUntil(condition: () => Promise<boolean> | boolean, timeoutMs = 10_000) {
    for (const deadline = Date.now() + timeoutMs; Date.now() < deadline && !(await condition()); ) {
      await new Promise(resolve => setTimeout(resolve, 20));
    }
  }

  it.each([
    [
      "lets a younger client's float top-up go while another client's non-gating receipt wait hangs",
      MoneriumRecoveryPhase.Swapping,
      { reverseSwapTxHash: "0xstuck" }
    ],
    // A swept a surplus (no float top-up hash): the float took that transfer in, so it is no float send in flight.
    [
      "does not let a surplus sweep's unconfirmed receipt hold the float for another client",
      MoneriumRecoveryPhase.ToppingUp,
      { surplusTxHash: "0xsweep" }
    ]
  ])("%s", async (_name, phase, patch) => {
    const a = await mappedAccount(0);
    const b = await mappedAccount(1);
    const depositA = await confirmedRecover(a.accountId, "a1", new Date(Date.now() - 90_000));
    const depositB = await confirmedRecover(b.accountId, "b1", new Date(Date.now() - 80_000), { eure: 99n * EUR, usdc: 0n });
    await openRecovery(depositA.id, phase, 60_000).then(row => row.update(patch));
    await openRecovery(depositB.id, MoneriumRecoveryPhase.Swapped, 30_000);
    const ledger: Ledger = { eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 99n * EUR], [FLOAT, 10n * EUR]]), usdc: new Map() };
    const { calls, depsFor } = clientsFixture(ledger);

    await cycleWithHungReceiptOfA(depsFor, async () => {
      await waitUntil(() => calls.some(call => call.startsWith("eure:float")));
      expect(calls).toEqual([`eure:float->${WALLETS[1].toLowerCase()}:${EUR}`]); // sent while A's wait is unresolved
    });
  });

  it("steps only a client's oldest open recovery per cycle", async () => {
    const { accountId } = await mappedAccount();
    const older = await confirmedRecover(accountId, "older", new Date(Date.now() - 90_000));
    const newer = await confirmedRecover(accountId, SECOND, new Date(Date.now() - 80_000));
    // Seeded directly: the opening query never produces two open recoveries for one client.
    await openRecovery(older.id, MoneriumRecoveryPhase.ToppedUp, 60_000, { eure: 100n * EUR, usdc: 0n });
    await openRecovery(newer.id, MoneriumRecoveryPhase.ToppedUp, 30_000, { eure: 100n * EUR, usdc: 0n });
    const ledger: Ledger = { eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() };
    const { calls, depsFor } = clientsFixture(ledger);

    await runRecoveryOrchestrator(depsFor);
    expect(calls.filter(call => call.startsWith("redeem:"))).toEqual(["redeem:0"]);
    expect((await MoneriumRecovery.findOne({ where: { depositId: older.id } }))?.phase).toBe(MoneriumRecoveryPhase.Redeeming);
    expect((await MoneriumRecovery.findOne({ where: { depositId: newer.id } }))?.phase).toBe(MoneriumRecoveryPhase.ToppedUp);
  });

  describe("refund monitor", () => {
    afterEach(() => {
      for (const spy of chainSpies) spy.mockRestore();
      chainSpies.length = 0;
    });
    const chainSpies: Array<{ mockRestore(): void }> = [];

    it("raises an error for a parked refund and stays quiet for a fresh one", async () => {
      const { accountId } = await mappedAccount();
      const deposit = await confirmedRecover(accountId, "monitored", new Date());
      const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);
      const warns = spyOn(logger, "warn").mockImplementation((() => logger) as never);
      const deps = dbDeps({ eure: new Map([[RECOVERY, 100n * EUR]]), usdc: new Map() });
      await runRecoveryOrchestrator(async () => deps);
      await runRefundMonitor();
      expect(errors).not.toHaveBeenCalled();
      expect(warns).not.toHaveBeenCalled();

      const recovery = (await MoneriumRecovery.findOne({ where: { depositId: deposit.id } })) as MoneriumRecovery;
      await recovery.update({ error: "redeem order rejected" });
      await runRefundMonitor();
      const text = errors.mock.calls.map(call => String(call[0])).join("\n");
      expect(text).toContain(deposit.id);
      expect(text).toContain("FAILED: redeem order rejected");
    });

    it("alerts for each client's parked refund while a healthy refund of another stays quiet", async () => {
      const a = await mappedAccount(0);
      const b = await mappedAccount(1);
      const c = await mappedAccount(2);
      const parkedA = await confirmedRecover(a.accountId, "a1", new Date());
      const healthyB = await confirmedRecover(b.accountId, "b1", new Date());
      const parkedC = await confirmedRecover(c.accountId, "c1", new Date());
      const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);
      spyOn(logger, "warn").mockImplementation((() => logger) as never);
      const ledger: Ledger = {
        eure: new Map([[WALLETS[0], 100n * EUR], [WALLETS[1], 100n * EUR], [FLOAT, 10n * EUR]]),
        usdc: new Map()
      };
      await runRecoveryOrchestrator(clientsFixture(ledger).depsFor);
      for (const deposit of [parkedA, parkedC]) {
        await MoneriumRecovery.update({ error: "parked" }, { where: { depositId: deposit.id } });
      }
      errors.mockClear();
      await runRefundMonitor();
      const text = errors.mock.calls.map(call => String(call[0])).join("\n");
      expect(text).toContain(parkedA.id);
      expect(text).toContain(parkedC.id);
      expect(text).not.toContain(healthyB.id);
    });

    it("warns when the float's ETH runs low and errors once it cannot pay for one transfer", async () => {
      await mappedAccount();
      let ethBalance = 10n ** 15n;
      chainSpies.push(
        spyOn(chain, "getFloatWalletClient").mockReturnValue({ account: { address: FLOAT } } as unknown as ReturnType<
          typeof chain.getFloatWalletClient
        >),
        spyOn(chain, "getPublicClient").mockReturnValue({
          getBalance: async () => ethBalance,
          getGasPrice: async () => 10n ** 9n,
          readContract: async () => 5_000n * EUR
        } as unknown as ReturnType<typeof chain.getPublicClient>),
        spyOn(chain, "getForwarderImmutables").mockResolvedValue({ eure: EURE } as unknown as chain.ForwarderImmutables)
      );
      const warns = spyOn(logger, "warn").mockImplementation((() => logger) as never);
      const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);

      await runRefundMonitor();
      expect(loggedText(warns)).toContain("float ETH running low");
      expect(errors).not.toHaveBeenCalled();

      warns.mockClear();
      ethBalance = 20_999n * 10n ** 9n; // one gas unit short of a 21k-gas transfer at 1 gwei
      await runRefundMonitor();
      expect(loggedText(errors)).toContain("FLOAT ETH EMPTY");
      expect(warns).not.toHaveBeenCalled();

      errors.mockClear();
      ethBalance = 10n ** 18n;
      await runRefundMonitor();
      expect(warns).not.toHaveBeenCalled();
      expect(errors).not.toHaveBeenCalled();
    });

    it("classifies each open refund by its own age: only the lingering one warns", async () => {
      const a = await mappedAccount(0);
      const b = await mappedAccount(1);
      const now = Date.now();
      const lingering = await confirmedRecover(a.accountId, "a1", new Date(now - 3 * 3_600_000));
      const fresh = await confirmedRecover(b.accountId, "b1", new Date(now));
      await openRecovery(lingering.id, MoneriumRecoveryPhase.Redeeming, 2 * 3_600_000);
      await openRecovery(fresh.id, MoneriumRecoveryPhase.Moved, 60_000);
      const errors = spyOn(logger, "error").mockImplementation((() => logger) as never);
      const warns = spyOn(logger, "warn").mockImplementation((() => logger) as never);

      await runRefundMonitor(now);
      const text = warns.mock.calls.map(call => String(call[0])).join("\n");
      expect(text).toContain(lingering.id);
      expect(text).not.toContain(fresh.id);
      expect(errors).not.toHaveBeenCalled();
    });
  });
});
