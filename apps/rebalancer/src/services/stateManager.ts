import { createClient } from "@supabase/supabase-js";
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

interface RebalanceContainer<S> {
  state: S;
  history: RebalanceHistoryEntry[];
}

// One Supabase Storage object per flow, holding the current run's state next to the history of completed runs.
class FlowStateManager<S extends { updatedTime: string }> {
  private inner: StateManager<RebalanceContainer<S>>;

  constructor(
    filename: string,
    private options: {
      // When set, a history entry recorded without a stored state is written next to this fresh state; otherwise it is skipped.
      createFreshState?: () => S;
      // Reads a pre-container file (the bare state object) as the state of an empty-history container.
      migrateFlatState?: boolean;
    } = {}
  ) {
    this.inner = new StateManager<RebalanceContainer<S>>(filename);
  }

  private async getContainer(): Promise<RebalanceContainer<S> | undefined> {
    const raw = await this.inner.getState();
    if (!raw) return undefined;

    if (this.options.migrateFlatState && "currentPhase" in raw && !("state" in raw)) {
      return { history: [], state: raw as unknown as S };
    }

    return raw;
  }

  async getState(): Promise<S | undefined> {
    const container = await this.getContainer();
    return container?.state;
  }

  async getHistory(): Promise<RebalanceHistoryEntry[]> {
    const container = await this.getContainer();
    return container?.history ?? [];
  }

  async saveState(state: S): Promise<void> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];
    state.updatedTime = new Date().toISOString();
    await this.inner.saveState({ history, state });
  }

  async addHistoryEntry(entry: RebalanceHistoryEntry): Promise<void> {
    const existing = await this.getContainer();
    if (!existing?.state) {
      if (!this.options.createFreshState) {
        console.warn("No existing state found for addHistoryEntry. Skipping history entry.");
        return;
      }
      console.warn("No existing state found for addHistoryEntry. Writing entry to fresh history.");
      await this.inner.saveState({ history: [entry], state: this.options.createFreshState() });
      return;
    }
    existing.history.push(entry);
    existing.state.updatedTime = new Date().toISOString();
    await this.inner.saveState(existing);
  }

  // The new state is created after the stored history is read, as the callers' start time is recorded in it.
  protected async startNew(createState: () => S): Promise<S> {
    const existing = await this.getContainer();
    const history = existing?.history ?? [];

    const state = createState();
    await this.inner.saveState({ history, state });
    return state;
  }
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

export class UsdcBaseStateManager extends FlowStateManager<UsdcBaseRebalanceState> {
  constructor() {
    super("rebalancer_state_usdc_base.json", { createFreshState, migrateFlatState: true });
  }

  startNewRebalance(usdcAmountRaw: string, options: UsdcBaseRebalanceStartOptions = {}): Promise<UsdcBaseRebalanceState> {
    return this.startNew(() =>
      createUsdcBaseRebalanceState(usdcAmountRaw, UsdcBaseRebalancePhase.CheckInitialUsdcBalance, options)
    );
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

export class BrlaToUsdcBaseStateManager extends FlowStateManager<BrlaToUsdcBaseRebalanceState> {
  constructor() {
    super("rebalancer_state_brla_to_usdc_base.json");
  }

  startNewRebalance(usdcAmountRaw: string): Promise<BrlaToUsdcBaseRebalanceState> {
    return this.startNew(() => ({
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
    }));
  }
}
