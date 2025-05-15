import { create } from 'zustand';

interface PartnerState {
  partnerId: string | undefined;
  setPartnerId: (partnerId: string | undefined) => void;
}

export const usePartnerStore = create<PartnerState>((set) => ({
  partnerId: undefined,
  setPartnerId: (partnerId) => set({ partnerId }),
}));

export const usePartnerId = () => usePartnerStore((state) => state.partnerId);
export const useSetPartnerId = () => usePartnerStore((state) => state.setPartnerId);
