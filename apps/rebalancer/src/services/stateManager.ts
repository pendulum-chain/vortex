import { createClient } from "@supabase/supabase-js";
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

export interface RebalanceState {
  squidRouterReceiverId: string | null;
  currentPhase: RebalancePhase;
  initialBalance: string | null;
  usdcAmountRaw: string | null;
  startingTime: string;
  updatedTime: string;
}

export class StateManager {
  private supabase;

  constructor() {
    const config = getConfig();
    this.supabase = createClient(config.supabaseUrl!, config.supabaseServiceKey!);
  }

  async getState(): Promise<RebalanceState> {
    try {
      const { data, error } = await this.supabase.storage.from("rebalancer_state").download("rebalancer_state.json");

      if (error) throw error;

      const stateText = await data.text();
      return JSON.parse(stateText);
    } catch (error: any) {
      if (error.message.includes("404") || error.message.includes("Object not found") || error.message.includes("Not Found")) {
        // return default idle state.
        return {
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

  async saveState(state: RebalanceState): Promise<void> {
    state.updatedTime = new Date().toISOString();

    const stateString = JSON.stringify(state);

    const { data, error } = await this.supabase.storage.from("rebalancer_state").upload("rebalancer_state.json", stateString, {
      cacheControl: "3600",
      contentType: "application/json", // overwrites the file if it exists
      upsert: true
    });

    if (error) {
      throw error;
    }
  }
}
