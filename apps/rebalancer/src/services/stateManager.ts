import { createClient } from "@supabase/supabase-js";
import Big from "big.js";
import { getConfig } from "../utils/config";

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

export class StateManager {
  private supabase;

  constructor() {
    const config = getConfig();
    this.supabase = createClient(config.supabaseUrl!, config.supabaseServiceKey!);
  }

  private async getRawState(): Promise<RebalanceState> {
    try {
      const { data, error } = await this.supabase.storage.from("rebalancer_state").download("rebalancer_state.json");

      if (error) throw error;

      const stateText = await data.text();
      return JSON.parse(stateText);
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("Object not found") || error.message.includes("Not Found")) {
        // return default idle state.
        return {
          amountAxlUsdc: null,
          brlaAmount: null,
          brlaToUsdcAmountUsd: null,
          currentPhase: RebalancePhase.Idle,
          initialBalance: null,
          squidRouterReceiverId: null,
          startingTime: new Date().toISOString(),
          updatedTime: new Date().toISOString(),
          usdcAmountRaw: null
        };
      }
      console.error("Error getting rebalance state:", error);
      throw error;
    }
  }

  async getState(): Promise<RebalanceStateParsed> {
    const rawState = await this.getRawState();
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
    rawState.updatedTime = new Date().toISOString();

    const stateString = JSON.stringify(rawState);

    const { data, error } = await this.supabase.storage.from("rebalancer_state").upload("rebalancer_state.json", stateString, {
      cacheControl: "3600",
      contentType: "application/json", // overwrites the file if it exists
      upsert: true
    });

    if (error) {
      throw error;
    }
  }

  async startNewRebalance(amountAxlUsdc: string): Promise<RebalanceStateParsed> {
    const state: RebalanceStateParsed = {
      amountAxlUsdc: amountAxlUsdc,
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
