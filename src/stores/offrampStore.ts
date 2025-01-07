import { create } from 'zustand';
import { OfframpState, OfframpActions } from '../types/offramp';
import { clearOfframpingState } from '../services/offrampingFlow';

interface OfframpStore extends OfframpState {
  actions: OfframpActions;
}

const useOfframpStore = create<OfframpStore>()((set) => ({
  // Initial state
  offrampStarted: false,
  offrampInitiating: false,
  offrampState: undefined,
  offrampSigningPhase: undefined,
  offrampAnchorSessionParams: undefined,
  offrampFirstSep24Response: undefined,
  offrampExecutionInput: undefined,

  actions: {
    // Simple setters
    setOfframpStarted: (started) => set({ offrampStarted: started }),
    setOfframpInitiating: (initiating) => set({ offrampInitiating: initiating }),
    setOfframpState: (state) => set({ offrampState: state }),
    setOfframpSigningPhase: (phase) => set({ offrampSigningPhase: phase }),

    // Complex setters
    setOfframpSep24Params: (params) => set((state) => ({ ...state, ...params })),

    // Business logic
    updateOfframpHookStateFromState: (state) => {
      if (!state || state.phase === 'success' || state.failure !== undefined) {
        set({ offrampSigningPhase: undefined });
      }
      set({ offrampState: state });
    },

    resetOfframpState: () => {
      clearOfframpingState();
      set({
        offrampStarted: false,
        offrampInitiating: false,
        offrampState: undefined,
        offrampSigningPhase: undefined,
        offrampAnchorSessionParams: undefined,
        offrampFirstSep24Response: undefined,
        offrampExecutionInput: undefined,
      });
    },
  },
}));

export const useOfframpSigningPhase = () => useOfframpStore((state) => state.offrampSigningPhase);
export const useOfframpState = () => useOfframpStore((state) => state.offrampState);
export const useOfframpStarted = () => useOfframpStore((state) => state.offrampStarted);
export const useOfframpInitiating = () => useOfframpStore((state) => state.offrampInitiating);
export const useOfframpFirstSep24Response = () => useOfframpStore((state) => state.offrampFirstSep24Response);
export const useOfframpExecutionInput = () => useOfframpStore((state) => state.offrampExecutionInput);
export const useOfframpAnchorSessionParams = () => useOfframpStore((state) => state.offrampAnchorSessionParams);

export const useOfframpActions = () => useOfframpStore((state) => state.actions);
