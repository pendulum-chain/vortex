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
      const storageError = error as { statusCode?: number | string; message?: string };
      const statusCode = storageError.statusCode;
      if (statusCode === 404 || statusCode === "404" || storageError.message?.includes("not found")) {
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
  CompareRates = "compareRates",
  NablaApprove = "nablaApprove",
  // nabla-main route: swap BRL->USDC on main Nabla (ends here)
  MainNablaApproveAndSwap = "mainNablaApproveAndSwap",
  // avenia/squid routes continue below
  TransferBrlaToAvenia = "transferBrlaToAvenia",
  WaitForBrlaOnAvenia = "waitForBrlaOnAvenia",
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
  [UsdcBaseRebalancePhase.CompareRates]: 2,
  [UsdcBaseRebalancePhase.NablaApprove]: 3,
  [UsdcBaseRebalancePhase.MainNablaApproveAndSwap]: 4,
  [UsdcBaseRebalancePhase.TransferBrlaToAvenia]: 5,
  [UsdcBaseRebalancePhase.WaitForBrlaOnAvenia]: 6,
  [UsdcBaseRebalancePhase.AveniaTransferToPolygon]: 7,
  [UsdcBaseRebalancePhase.WaitBrlaOnPolygon]: 8,
  [UsdcBaseRebalancePhase.SquidRouterApproveAndSwap]: 9,
  [UsdcBaseRebalancePhase.WaitUsdcOnBaseFromSquid]: 10,
  [UsdcBaseRebalancePhase.AveniaSwapToUsdcBase]: 7,
  [UsdcBaseRebalancePhase.WaitUsdcOnBaseFromAvenia]: 8,
  [UsdcBaseRebalancePhase.VerifyFinalBalance]: 11
};

export type WinningRoute = "squidrouter" | "avenia" | "nabla-main" | null;

export interface UsdcBaseRebalanceState {
  currentPhase: UsdcBaseRebalancePhase;
  initialUsdcBalance: string | null;
  usdcAmountRaw: string | null;
  brlaAmountRaw: string | null;
  brlaAmountDecimal: string | null;
  brlaBalanceBeforeNablaRaw: string | null;
  nablaApproveHash: string | null;
  nablaSwapHash: string | null;
  aveniaBrlaBalanceBeforeTransfer: string | null;
  brlaTransferHash: string | null;
  winningRoute: WinningRoute;
  squidRouterQuoteUsdc: string | null;
  aveniaQuoteUsdc: string | null;
  mainNablaQuoteUsdc: string | null;
  // Observational-only BlindPay shadow quote (USDC-equivalent raw, 6 decimals); never routed.
  blindpayShadowQuoteUsdc: string | null;
  mainNablaApproveHash: string | null;
  mainNablaSwapHash: string | null;
  mainNablaUsdcBalanceBeforeRaw: string | null;
  opportunisticDeviationBps: number | null;
  opportunisticMaxCostBps: number | null;
  opportunisticRequiresProfit: boolean;
  opportunisticUsdcToBrla: boolean;
  polygonBrlaBalanceBeforeTransferRaw: string | null;
  squidRouterSwapHash: string | null;
  baseUsdcBalanceBeforeAveniaSwapRaw: string | null;
  baseUsdcBalanceBeforeSquidSwapRaw: string | null;
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

export interface UsdcBaseRebalanceStartOptions {
  opportunisticDeviationBps?: number;
  opportunisticMaxCostBps?: number;
  opportunisticRequiresProfit?: boolean;
  opportunisticUsdcToBrla?: boolean;
}

export function createUsdcBaseRebalanceState(
  usdcAmountRaw: string | null,
  currentPhase: UsdcBaseRebalancePhase,
  options: UsdcBaseRebalanceStartOptions = {}
): UsdcBaseRebalanceState {
  return {
    aveniaBrlaBalanceBeforeTransfer: null,
    aveniaQuoteUsdc: null,
    aveniaTicketId: null,
    baseUsdcBalanceBeforeAveniaSwapRaw: null,
    baseUsdcBalanceBeforeSquidSwapRaw: null,
    blindpayShadowQuoteUsdc: null,
    brlaAmountDecimal: null,
    brlaAmountRaw: null,
    brlaBalanceBeforeNablaRaw: null,
    brlaTransferHash: null,
    currentPhase,
    finalUsdcBalance: null,
    initialUsdcBalance: null,
    mainNablaApproveHash: null,
    mainNablaQuoteUsdc: null,
    mainNablaSwapHash: null,
    mainNablaUsdcBalanceBeforeRaw: null,
    nablaApproveHash: null,
    nablaSwapHash: null,
    opportunisticDeviationBps: options.opportunisticDeviationBps ?? null,
    opportunisticMaxCostBps: options.opportunisticMaxCostBps ?? null,
    opportunisticRequiresProfit: options.opportunisticRequiresProfit ?? false,
    opportunisticUsdcToBrla: options.opportunisticUsdcToBrla ?? false,
    polygonBrlaBalanceBeforeTransferRaw: null,
    squidRouterQuoteUsdc: null,
    squidRouterSwapHash: null,
    startingTime: new Date().toISOString(),
    updatedTime: new Date().toISOString(),
    usdcAmountRaw,
    winningRoute: null
  };
}

function createFreshState(): UsdcBaseRebalanceState {
  return createUsdcBaseRebalanceState(null, UsdcBaseRebalancePhase.Idle);
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

  async startNewRebalance(usdcAmountRaw: string, options: UsdcBaseRebalanceStartOptions = {}): Promise<UsdcBaseRebalanceState> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];

    const state = createUsdcBaseRebalanceState(usdcAmountRaw, UsdcBaseRebalancePhase.CheckInitialUsdcBalance, options);
    await this.inner.saveState({ history, state });
    return state;
  }
}

// --- BRLA->USDC (Base) rebalance flow ---

export enum BrlaToUsdcBaseRebalancePhase {
  Idle = "idle",
  CheckInitialUsdcBalance = "checkInitialUsdcBalance",
  MainNablaSwapUsdcToBrla = "mainNablaSwapUsdcToBrla",
  NablaSwapBrlaToUsdc = "nablaSwapBrlaToUsdc",
  VerifyFinalBalance = "verifyFinalBalance"
}

export const brlaToUsdcBasePhaseOrder: Record<BrlaToUsdcBaseRebalancePhase, number> = {
  [BrlaToUsdcBaseRebalancePhase.Idle]: 0,
  [BrlaToUsdcBaseRebalancePhase.CheckInitialUsdcBalance]: 1,
  [BrlaToUsdcBaseRebalancePhase.MainNablaSwapUsdcToBrla]: 2,
  [BrlaToUsdcBaseRebalancePhase.NablaSwapBrlaToUsdc]: 3,
  [BrlaToUsdcBaseRebalancePhase.VerifyFinalBalance]: 4
};

export interface BrlaToUsdcBaseRebalanceState {
  currentPhase: BrlaToUsdcBaseRebalancePhase;
  usdcAmountRaw: string | null;
  initialUsdcBalance: string | null;
  usdcBalanceBeforeNablaRaw: string | null;
  nablaApproveHash: string | null;
  nablaSwapHash: string | null;
  usdcReceivedRaw: string | null;
  mainNablaBrlaBalanceBeforeRaw: string | null;
  mainNablaApproveHash: string | null;
  mainNablaSwapHash: string | null;
  mainNablaBrlaReceivedRaw: string | null;
  finalUsdcBalance: string | null;
  startingTime: string;
  updatedTime: string;
}

export interface BrlaToUsdcBaseRebalanceContainer {
  state: BrlaToUsdcBaseRebalanceState;
  history: RebalanceHistoryEntry[];
}

export class BrlaToUsdcBaseStateManager {
  private inner: StateManager<BrlaToUsdcBaseRebalanceContainer>;

  constructor() {
    this.inner = new StateManager<BrlaToUsdcBaseRebalanceContainer>("rebalancer_state_brla_to_usdc_base.json");
  }

  private async getContainer(): Promise<BrlaToUsdcBaseRebalanceContainer | undefined> {
    return this.inner.getState();
  }

  async getState(): Promise<BrlaToUsdcBaseRebalanceState | undefined> {
    const container = await this.getContainer();
    return container?.state;
  }

  async getHistory(): Promise<RebalanceHistoryEntry[]> {
    const container = await this.getContainer();
    return container?.history ?? [];
  }

  async saveState(state: BrlaToUsdcBaseRebalanceState): Promise<void> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];
    state.updatedTime = new Date().toISOString();
    await this.inner.saveState({ history, state });
  }

  async addHistoryEntry(entry: RebalanceHistoryEntry): Promise<void> {
    const existing = await this.getContainer();
    if (!existing?.state) {
      console.warn("No existing state found for addHistoryEntry. Skipping history entry.");
      return;
    }
    existing.history.push(entry);
    existing.state.updatedTime = new Date().toISOString();
    await this.inner.saveState(existing);
  }

  async startNewRebalance(usdcAmountRaw: string): Promise<BrlaToUsdcBaseRebalanceState> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];

    const state: BrlaToUsdcBaseRebalanceState = {
      currentPhase: BrlaToUsdcBaseRebalancePhase.CheckInitialUsdcBalance,
      finalUsdcBalance: null,
      initialUsdcBalance: null,
      mainNablaApproveHash: null,
      mainNablaBrlaBalanceBeforeRaw: null,
      mainNablaBrlaReceivedRaw: null,
      mainNablaSwapHash: null,
      nablaApproveHash: null,
      nablaSwapHash: null,
      startingTime: new Date().toISOString(),
      updatedTime: new Date().toISOString(),
      usdcAmountRaw,
      usdcBalanceBeforeNablaRaw: null,
      usdcReceivedRaw: null
    };
    await this.inner.saveState({ history, state });
    return state;
  }
}
