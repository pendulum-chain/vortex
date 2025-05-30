import { create } from 'zustand';

interface PartnerState {
  // The partner ID first has to be set from the URL parameters before it can be used.
  // Use `undefined` to indicate that the partner ID is not set yet and `null` to indicate that it is not available.
  partnerId: string | undefined | null;
  setPartnerId: (partnerId: string | undefined | null) => void;
}

export const usePartnerStore = create<PartnerState>((set) => ({
  partnerId: undefined,
  setPartnerId: (partnerId) => set({ partnerId }),
}));

export const usePartnerId = () => usePartnerStore((state) => state.partnerId);
export const useSetPartnerId = () => usePartnerStore((state) => state.setPartnerId);
