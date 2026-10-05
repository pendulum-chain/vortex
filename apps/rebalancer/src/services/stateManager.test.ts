import {afterAll, beforeAll, describe, expect, test} from "bun:test";
import {
  BrlaToUsdcBaseRebalancePhase,
  BrlaToUsdcBaseStateManager,
  createUsdcBaseRebalanceState,
  type RebalanceHistoryEntry,
  UsdcBaseRebalancePhase,
  UsdcBaseStateManager
} from "./stateManager.ts";

describe("USDC Base rebalance state", () => {
  test("stores opportunistic fallback policy in the initial state payload", () => {
    const state = createUsdcBaseRebalanceState("100000000", UsdcBaseRebalancePhase.CheckInitialUsdcBalance, {
      opportunisticDeviationBps: 0,
      opportunisticMaxCostBps: 10,
      opportunisticRequiresProfit: true,
      opportunisticUsdcToBrla: true
    });

    expect(state.usdcAmountRaw).toBe("100000000");
    expect(state.opportunisticUsdcToBrla).toBe(true);
    expect(state.opportunisticMaxCostBps).toBe(10);
    expect(state.opportunisticRequiresProfit).toBe(true);
    expect(state.opportunisticDeviationBps).toBe(0);
  });
});

// The managers persist one Supabase Storage JSON object per flow. These tests pin the persisted
// shape and the per-flow differences against an in-memory stand-in for the storage object.
class MemoryStore {
  value: unknown;
  saves: unknown[] = [];

  async getState() {
    return this.value === undefined ? undefined : JSON.parse(JSON.stringify(this.value));
  }

  async saveState(state: unknown) {
    this.value = JSON.parse(JSON.stringify(state));
    this.saves.push(this.value);
  }
}

const ENV_NAMES = ["EVM_ACCOUNT_SECRET", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"] as const;
const originalEnv = new Map<string, string | undefined>(ENV_NAMES.map(name => [name, process.env[name]]));

beforeAll(() => {
  process.env.EVM_ACCOUNT_SECRET = "test test test test test test test test test test test junk";
  process.env.SUPABASE_URL = "http://localhost:54321";
  process.env.SUPABASE_SERVICE_KEY = "test-service-key";
});

afterAll(() => {
  for (const name of ENV_NAMES) {
    const value = originalEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function withStore<T extends object>(manager: T) {
  const store = new MemoryStore();
  (manager as unknown as { inner: MemoryStore }).inner = store;
  return { manager, store };
}

const entry: RebalanceHistoryEntry = {
  cost: "0.5",
  costRelative: "0.0050",
  endingTime: "2026-06-18T11:00:00.000Z",
  initialAmount: "100000000",
  startingTime: "2026-06-18T10:00:00.000Z"
};
const earlier: RebalanceHistoryEntry = { ...entry, initialAmount: "5", startingTime: "2026-06-17T10:00:00.000Z" };
const STALE = "2000-01-01T00:00:00.000Z";

describe.each([
  ["USDC->BRLA->USDC", () => new UsdcBaseStateManager(), UsdcBaseRebalancePhase],
  ["BRLA->USDC", () => new BrlaToUsdcBaseStateManager(), BrlaToUsdcBaseRebalancePhase]
] as const)("%s state manager", (_name, create, Phase) => {
  test("reads empty state and history when nothing is stored", async () => {
    const { manager } = withStore(create());

    expect(await manager.getState()).toBeUndefined();
    expect(await manager.getHistory()).toEqual([]);
  });

  test("saveState refreshes updatedTime and keeps the stored history", async () => {
    const { manager, store } = withStore(create());
    const started = await manager.startNewRebalance("100000000");
    store.value = { history: [earlier], state: { ...started, updatedTime: STALE } };

    const state = { ...started, currentPhase: Phase.VerifyFinalBalance, updatedTime: STALE };
    await manager.saveState(state as never);

    const persisted = store.value as { history: unknown[]; state: { currentPhase: string; updatedTime: string } };
    expect(Object.keys(persisted).sort()).toEqual(["history", "state"]);
    expect(persisted.history).toEqual([earlier]);
    expect(persisted.state.currentPhase).toBe(Phase.VerifyFinalBalance);
    expect(persisted.state.updatedTime).not.toBe(STALE);
    expect(state.updatedTime).toBe(persisted.state.updatedTime);
  });

  test("addHistoryEntry appends to the history and bumps the state's updatedTime", async () => {
    const { manager, store } = withStore(create());
    const started = await manager.startNewRebalance("100000000");
    store.value = { history: [earlier], state: { ...started, updatedTime: STALE } };

    await manager.addHistoryEntry(entry);

    const persisted = store.value as { history: unknown[]; state: { currentPhase: string; updatedTime: string } };
    expect(persisted.history).toEqual([earlier, entry]);
    expect(persisted.state.currentPhase).toBe(Phase.CheckInitialUsdcBalance);
    expect(persisted.state.updatedTime).not.toBe(STALE);
    expect(await manager.getHistory()).toEqual([earlier, entry]);
  });

  test("startNewRebalance keeps the history and persists a fresh state", async () => {
    const { manager, store } = withStore(create());
    store.value = { history: [earlier], state: { currentPhase: Phase.Idle } };

    const state = await manager.startNewRebalance("250000000");

    const persisted = store.value as { history: unknown[]; state: Record<string, unknown> };
    expect(persisted.history).toEqual([earlier]);
    expect(persisted.state).toEqual(JSON.parse(JSON.stringify(state)));
    expect(state.currentPhase).toBe(Phase.CheckInitialUsdcBalance);
    expect(state.usdcAmountRaw).toBe("250000000");
    expect(await manager.getState()).toEqual(state as never);
  });
});

describe("USDC->BRLA->USDC state manager specifics", () => {
  test("startNewRebalance stores the opportunistic options", async () => {
    const { manager, store } = withStore(new UsdcBaseStateManager());

    const state = await manager.startNewRebalance("100000000", {
      opportunisticDeviationBps: 3,
      opportunisticMaxCostBps: 10,
      opportunisticRequiresProfit: true,
      opportunisticUsdcToBrla: true
    });

    expect(state).toMatchObject({
      opportunisticDeviationBps: 3,
      opportunisticMaxCostBps: 10,
      opportunisticRequiresProfit: true,
      opportunisticUsdcToBrla: true
    });
    expect((store.value as { state: unknown }).state).toEqual(JSON.parse(JSON.stringify(state)));
  });

  test("migrates a flat pre-container state file on read", async () => {
    const { manager, store } = withStore(new UsdcBaseStateManager());
    const flat = createUsdcBaseRebalanceState("100000000", UsdcBaseRebalancePhase.NablaApprove);
    store.value = flat;

    expect(await manager.getState()).toEqual(flat);
    expect(await manager.getHistory()).toEqual([]);
  });

  test("addHistoryEntry without a stored state writes the entry next to a fresh idle state", async () => {
    const { manager, store } = withStore(new UsdcBaseStateManager());

    await manager.addHistoryEntry(entry);

    const persisted = store.value as { history: unknown[]; state: { currentPhase: string; usdcAmountRaw: string | null } };
    expect(persisted.history).toEqual([entry]);
    expect(persisted.state.currentPhase).toBe(UsdcBaseRebalancePhase.Idle);
    expect(persisted.state.usdcAmountRaw).toBeNull();
  });
});

describe("BRLA->USDC state manager specifics", () => {
  test("does not migrate a flat state file", async () => {
    const { manager, store } = withStore(new BrlaToUsdcBaseStateManager());
    store.value = { currentPhase: BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla, usdcAmountRaw: "1" };

    expect(await manager.getState()).toBeUndefined();
  });

  test("addHistoryEntry without a stored state writes nothing", async () => {
    const { manager, store } = withStore(new BrlaToUsdcBaseStateManager());

    await manager.addHistoryEntry(entry);

    expect(store.saves).toEqual([]);
    expect(store.value).toBeUndefined();
  });
});
