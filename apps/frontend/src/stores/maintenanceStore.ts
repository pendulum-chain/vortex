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
  clearError: () => void;
  reset: () => void;
}

const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes in milliseconds

export const useMaintenanceStore = create<MaintenanceStore>((set, get) => ({
  clearError: () => set({ error: null }),
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
  maintenanceStatus: null,

  reset: () =>
    set({
      error: null,
      isLoading: false,
      lastFetched: null,
      maintenanceStatus: null
    })
}));

// Selectors for easier access
export const useMaintenanceStatus = () => useMaintenanceStore(state => state.maintenanceStatus);
export const useIsMaintenanceActive = () =>
  useMaintenanceStore(state => state.maintenanceStatus?.is_maintenance_active ?? false);
export const useMaintenanceDetails = () => useMaintenanceStore(state => state.maintenanceStatus?.maintenance_details ?? null);
export const useMaintenanceLoading = () => useMaintenanceStore(state => state.isLoading);
export const useMaintenanceError = () => useMaintenanceStore(state => state.error);
export const useFetchMaintenanceStatus = () => useMaintenanceStore(state => state.fetchMaintenanceStatus);
