import { create } from 'zustand';
import { OfframpState, OfframpActions } from '../types/offramp';
import { clearOfframpingState } from '../services/offrampingFlow';

interface OfframpStore extends OfframpState, OfframpActions {}

export const useOfframpStore = create<OfframpStore>()((set) => ({
  // Initial state
  offrampingStarted: false,
  isInitiating: false,
  offrampingState: undefined,
  signingPhase: undefined,
  anchorSessionParams: undefined,
  firstSep24Response: undefined,
  executionInput: undefined,

  // Simple setters
  setOfframpingStarted: (started) => set({ offrampingStarted: started }),
  setIsInitiating: (initiating) => set({ isInitiating: initiating }),
  setOfframpingState: (state) => set({ offrampingState: state }),
  setSigningPhase: (phase) => set({ signingPhase: phase }),

  // Complex setters
  setSep24Params: (params) => set((state) => ({ ...state, ...params })),

  // Business logic
  updateHookStateFromState: (state) => {
    if (!state || state.phase === 'success' || state.failure !== undefined) {
      set({ signingPhase: undefined });
    }
    set({ offrampingState: state });
  },

  resetState: async () => {
    await clearOfframpingState();
    set({
      offrampingStarted: false,
      isInitiating: false,
      offrampingState: undefined,
      signingPhase: undefined,
      anchorSessionParams: undefined,
      firstSep24Response: undefined,
      executionInput: undefined,
    });
  },
}));

export const useSep24State = () =>
  useOfframpStore((state) => ({
    anchorSessionParams: state.anchorSessionParams,
    firstSep24Response: state.firstSep24Response,
    executionInput: state.executionInput,
  }));
