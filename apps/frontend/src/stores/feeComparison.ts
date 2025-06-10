import { create } from 'zustand';

interface FeeComparisonStore {
  feeComparisonRef: React.RefObject<HTMLDivElement | null> | null;
  setFeeComparisonRef: (ref: React.RefObject<HTMLDivElement | null>) => void;
  trackPrice: boolean;
  setTrackPrice: (trackPrice: boolean) => void;
}

export const useFeeComparisonStore = create<FeeComparisonStore>((set) => ({
  feeComparisonRef: null,
  setFeeComparisonRef: (ref) => set({ feeComparisonRef: ref }),
  trackPrice: false,
  setTrackPrice: (trackPrice) => set({ trackPrice }),
}));
