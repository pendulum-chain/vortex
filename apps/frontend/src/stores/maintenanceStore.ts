import { create } from "zustand";
import { getMaintenanceStatus, MaintenanceStatusResponse } from "../services/api/maintenance.service";

interface MaintenanceStore {
  // State
  maintenanceStatus: MaintenanceStatusResponse | null;
  isLoading: boolean;
  error: string | null;
  lastFetched: number | null;

  // Actions
  fetchMaintenanceStatus: () => Promise<void>;
}

// Below the hook's 5-minute poll: lastFetched lands after the response, so an equal window skips every other poll.
const CACHE_DURATION = 60 * 1000;

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  error: null,

  // Actions
  fetchMaintenanceStatus: async () => {
    const state = get();

    // Check if we have recent data (within cache duration)
    if (state.maintenanceStatus && state.lastFetched && Date.now() - state.lastFetched < CACHE_DURATION) {
      return;
    }

    set({ error: null, isLoading: true });

    try {
      const status = await getMaintenanceStatus();
      set({
        error: null,
        isLoading: false,
        lastFetched: Date.now(),
        maintenanceStatus: status
      });
    } catch (error) {
      console.error("Failed to fetch maintenance status:", error);
      set({
        error: error instanceof Error ? error.message : "Failed to fetch maintenance status",
        isLoading: false
      });
    }
  },
  isLoading: false,
  lastFetched: null,
  // Initial state
  maintenanceStatus: null
}));

// Selectors for easier access
export const useIsMaintenanceActive = () =>
  useMaintenanceStore(state => state.maintenanceStatus?.is_maintenance_active ?? false);
export const useMaintenanceDetails = () => useMaintenanceStore(state => state.maintenanceStatus?.maintenance_details ?? null);
export const useFetchMaintenanceStatus = () => useMaintenanceStore(state => state.fetchMaintenanceStatus);
