import { create } from "zustand";

interface PartnerState {
  // The partner ID first has to be set from the URL parameters before it can be used.
  // Use `undefined` to indicate that the partner ID is not set yet and `null` to indicate that it is not available.
  partnerId: string | undefined | null;
  apiKey: string | undefined | null;
  setApiKey: (apiKey: string | undefined | null) => void;
  setPartnerId: (partnerId: string | undefined | null) => void;
}

export const usePartnerStore = create<PartnerState>(set => ({
  apiKey: undefined,
  partnerId: undefined,
  setApiKey: apiKey => set({ apiKey }),
  setPartnerId: partnerId => set({ partnerId })
}));

export const usePartnerId = () => usePartnerStore(state => state.partnerId);
export const useSetPartnerId = () => usePartnerStore(state => state.setPartnerId);
export const useApiKey = () => usePartnerStore(state => state.apiKey);
export const useSetApiKey = () => usePartnerStore(state => state.setApiKey);
