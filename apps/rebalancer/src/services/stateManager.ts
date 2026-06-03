import { createClient } from "@supabase/supabase-js";
import Big from "big.js";
import { getConfig } from "../utils/config";

export class StateManager<T> {
  private supabase;
  private filename: string;

  constructor(filename: string) {
    const config = getConfig();
    if (!config.supabaseUrl || !config.supabaseServiceKey) {
      throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_KEY environment variables");
    }
    this.filename = filename;
    this.supabase = createClient(config.supabaseUrl, config.supabaseServiceKey);
  }

  async getState(): Promise<T | undefined> {
    const { data, error } = await this.supabase.storage.from("rebalancer_state").download(this.filename);

    if (error) {
      const statusCode = (error as any).statusCode;
      if (statusCode === 404 || statusCode === "404" || error.message?.includes("not found")) {
        return undefined;
      }
      throw error;
    }

    const stateText = await data.text();
    try {
      return JSON.parse(stateText) as T;
    } catch {
      console.warn("Rebalancer state is not valid JSON, treating as missing.");
      return undefined;
    }
  }

  async saveState(state: T): Promise<void> {
    if (state && typeof state === "object" && "updatedTime" in state) {
      (state as { updatedTime: string }).updatedTime = new Date().toISOString();
    }
    const stateString = JSON.stringify(state);

    const { error } = await this.supabase.storage.from("rebalancer_state").upload(this.filename, stateString, {
      cacheControl: "3600",
      contentType: "application/json",
      upsert: true
    });

    if (error) {
      throw error;
    }
  }
}

// --- BRLA-to-axlUSDC (Pendulum) rebalance flow ---

export enum RebalancePhase {
  Idle = "idle",
  CheckInitialPendulumBalance = "checkInitialPendulumBalance",
  SwapAxlusdcToBrla = "swapAxlusdcToBrla",
  SendBrlaToMoonbeam = "sendBrlaToMoonbeam",
  PollForSufficientBalance = "pollForSufficientBalance",
  SwapBrlaToUsdcOnBrlaApiService = "swapBrlaToUsdcOnBrlaApiService",
  TransferUsdcToMoonbeamWithSquidrouter = "transferUsdcToMoonbeamWithSquidrouter",
  TriggerXcmFromMoonbeam = "triggerXcmFromMoonbeam",
  WaitForAxlUsdcOnPendulum = "waitForAxlUsdcOnPendulum"
}

export const phaseOrder: Record<RebalancePhase, number> = {
  [RebalancePhase.Idle]: 0,
  [RebalancePhase.CheckInitialPendulumBalance]: 1,
  [RebalancePhase.SwapAxlusdcToBrla]: 2,
  [RebalancePhase.SendBrlaToMoonbeam]: 3,
  [RebalancePhase.PollForSufficientBalance]: 4,
  [RebalancePhase.SwapBrlaToUsdcOnBrlaApiService]: 5,
  [RebalancePhase.TransferUsdcToMoonbeamWithSquidrouter]: 6,
  [RebalancePhase.TriggerXcmFromMoonbeam]: 7,
  [RebalancePhase.WaitForAxlUsdcOnPendulum]: 8
};

export interface RebalanceState {
  squidRouterReceiverId: string | null;
  currentPhase: RebalancePhase;
  initialBalance: string | null;
  usdcAmountRaw: string | null;
  amountAxlUsdc: string | null;
  brlaAmount: string | null;
  brlaToUsdcAmountUsd: string | null;
  startingTime: string;
  updatedTime: string;
}

export interface RebalanceStateParsed {
  squidRouterReceiverId: string | null;
  currentPhase: RebalancePhase;
  initialBalance: Big | null;
  usdcAmountRaw: string | null;
  amountAxlUsdc: string | null;
  brlaAmount: Big | null;
  brlaToUsdcAmountUsd: string | null;
  startingTime: string;
  updatedTime: string;
}

export class BrlaToAxlUsdcStateManager {
  private inner: StateManager<RebalanceState>;

  constructor() {
    this.inner = new StateManager<RebalanceState>("rebalancer_state.json");
  }

  async getState(): Promise<RebalanceStateParsed | undefined> {
    const rawState = await this.inner.getState();
    if (!rawState) return undefined;

    return {
      ...rawState,
      brlaAmount: rawState.brlaAmount ? Big(rawState.brlaAmount) : null,
      initialBalance: rawState.initialBalance ? Big(rawState.initialBalance) : null
    };
  }

  async saveState(state: RebalanceStateParsed): Promise<void> {
    const rawState: RebalanceState = {
      ...state,
      brlaAmount: state.brlaAmount ? state.brlaAmount.toString() : null,
      initialBalance: state.initialBalance ? state.initialBalance.toString() : null
    };
    await this.inner.saveState(rawState);
  }

  async startNewRebalance(amountAxlUsdc: string): Promise<RebalanceStateParsed> {
    const state: RebalanceStateParsed = {
      amountAxlUsdc,
      brlaAmount: null,
      brlaToUsdcAmountUsd: null,
      currentPhase: RebalancePhase.CheckInitialPendulumBalance,
      initialBalance: null,
      squidRouterReceiverId: null,
      startingTime: new Date().toISOString(),
      updatedTime: new Date().toISOString(),
      usdcAmountRaw: null
    };
    await this.saveState(state);
    return state;
  }
}

// --- USDC->BRLA->USDC (Base) rebalance flow ---

export enum UsdcBaseRebalancePhase {
  Idle = "idle",
  CheckInitialUsdcBalance = "checkInitialUsdcBalance",
  NablaApprove = "nablaApprove",
  TransferBrlaToAvenia = "transferBrlaToAvenia",
  WaitForBrlaOnAvenia = "waitForBrlaOnAvenia",
  CompareRates = "compareRates",
  AveniaTransferToPolygon = "aveniaTransferToPolygon",
  WaitBrlaOnPolygon = "waitBrlaOnPolygon",
  SquidRouterApproveAndSwap = "squidRouterApproveAndSwap",
  WaitUsdcOnBaseFromSquid = "waitUsdcOnBaseFromSquid",
  AveniaSwapToUsdcBase = "aveniaSwapToUsdcBase",
  WaitUsdcOnBaseFromAvenia = "waitUsdcOnBaseFromAvenia",
  VerifyFinalBalance = "verifyFinalBalance"
}

export const usdcBasePhaseOrder: Record<UsdcBaseRebalancePhase, number> = {
  [UsdcBaseRebalancePhase.Idle]: 0,
  [UsdcBaseRebalancePhase.CheckInitialUsdcBalance]: 1,
  [UsdcBaseRebalancePhase.NablaApprove]: 2,
  [UsdcBaseRebalancePhase.TransferBrlaToAvenia]: 3,
  [UsdcBaseRebalancePhase.WaitForBrlaOnAvenia]: 4,
  [UsdcBaseRebalancePhase.CompareRates]: 5,
  [UsdcBaseRebalancePhase.AveniaTransferToPolygon]: 6,
  [UsdcBaseRebalancePhase.WaitBrlaOnPolygon]: 7,
  [UsdcBaseRebalancePhase.SquidRouterApproveAndSwap]: 8,
  [UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid]: 9,
  [UsdcBaseRebalancePhase.AveniaSwapToUsdcBase]: 6,
  [UsdcBaseRebalancePhase.WaitUsdcOnBaseFromAvenia]: 7,
  [UsdcBaseRebalancePhase.VerifyFinalBalance]: 10
};

export type WinningRoute = "squidrouter" | "avenia" | null;

export interface UsdcBaseRebalanceState {
  currentPhase: UsdcBaseRebalancePhase;
  initialUsdcBalance: string | null;
  usdcAmountRaw: string | null;
  brlaAmountRaw: string | null;
  brlaAmountDecimal: string | null;
  nablaApproveHash: string | null;
  nablaSwapHash: string | null;
  brlaTransferHash: string | null;
  winningRoute: WinningRoute;
  squidRouterQuoteUsdc: string | null;
  aveniaQuoteUsdc: string | null;
  squidRouterSwapHash: string | null;
  aveniaTicketId: string | null;
  finalUsdcBalance: string | null;
  startingTime: string;
  updatedTime: string;
}

export interface RebalanceHistoryEntry {
  initialAmount: string;
  startingTime: string;
  endingTime: string;
  cost: string;
  costRelative: string;
}

export interface UsdcBaseRebalanceContainer {
  state: UsdcBaseRebalanceState;
  history: RebalanceHistoryEntry[];
}

function createFreshState(): UsdcBaseRebalanceState {
  return {
    aveniaQuoteUsdc: null,
    aveniaTicketId: null,
    brlaAmountDecimal: null,
    brlaAmountRaw: null,
    brlaTransferHash: null,
    currentPhase: UsdcBaseRebalancePhase.Idle,
    finalUsdcBalance: null,
    initialUsdcBalance: null,
    nablaApproveHash: null,
    nablaSwapHash: null,
    squidRouterQuoteUsdc: null,
    squidRouterSwapHash: null,
    startingTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    usdcAmountRaw: null,
    winningRoute: null
  };
}

export class UsdcBaseStateManager {
  private inner: StateManager<UsdcBaseRebalanceContainer>;

  constructor() {
    this.inner = new StateManager<UsdcBaseRebalanceContainer>("rebalancer_state_usdc_base.json");
  }

  // Handles migration from old flat UsdcBaseRebalanceState to new UsdcBaseRebalanceContainer.
  private async getContainer(): Promise<UsdcBaseRebalanceContainer | undefined> {
    const raw = await this.inner.getState();
    if (!raw) return undefined;

    if ("currentPhase" in raw && !("state" in raw)) {
      return { history: [], state: raw as unknown as UsdcBaseRebalanceState };
    }

    return raw;
  }

  async getState(): Promise<UsdcBaseRebalanceState | undefined> {
    const container = await this.getContainer();
    return container?.state;
  }

  async getHistory(): Promise<RebalanceHistoryEntry[]> {
    const container = await this.getContainer();
    return container?.history ?? [];
  }

  async saveState(state: UsdcBaseRebalanceState): Promise<void> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];
    state.updatedTime = new Date().toISOString();
    await this.inner.saveState({ history, state });
  }

  async addHistoryEntry(entry: RebalanceHistoryEntry): Promise<void> {
    const existing = await this.getContainer();
    if (!existing?.state) {
      console.warn("No existing state found for addHistoryEntry. Writing entry to fresh history.");
      await this.inner.saveState({ history: [entry], state: createFreshState() });
      return;
    }
    existing.history.push(entry);
    existing.state.updatedTime = new Date().toISOString();
    await this.inner.saveState(existing);
  }

  async startNewRebalance(usdcAmountRaw: string): Promise<UsdcBaseRebalanceState> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];

    const state: UsdcBaseRebalanceState = {
      aveniaQuoteUsdc: null,
      aveniaTicketId: null,
      brlaAmountDecimal: null,
      brlaAmountRaw: null,
      brlaTransferHash: null,
      currentPhase: UsdcBaseRebalancePhase.CheckInitialUsdcBalance,
      finalUsdcBalance: null,
      initialUsdcBalance: null,
      nablaApproveHash: null,
      nablaSwapHash: null,
      squidRouterQuoteUsdc: null,
      squidRouterSwapHash: null,
      startingTime: new Date().toISOString(),
      updatedTime: new Date().toISOString(),
      usdcAmountRaw,
      winningRoute: null
    };
    await this.inner.saveState({ history, state });
    return state;
  }
}
