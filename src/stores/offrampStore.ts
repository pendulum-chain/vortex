import { create } from 'zustand';
import { OfframpState, OfframpActions } from '../types/offramp';
import { clearOfframpingState } from '../services/offrampingFlow';

interface OfframpStore extends OfframpState {
  actions: OfframpActions;
}

export const useOfframpStore = create<OfframpStore>()((set) => ({
  offrampStarted: false,
  offrampInitiating: false,
  offrampKycStarted: false,
  offrampState: undefined,
  offrampSigningPhase: undefined,
  offrampExecutionInput: undefined,
  offrampSummaryVisible: false,
  initializeFailedMessage: undefined,

  actions: {
    setOfframpStarted: (started) => set({ offrampStarted: started }),
    setOfframpInitiating: (initiating) => set({ offrampInitiating: initiating }),
    setOfframpState: (state) => set({ offrampState: state }),
    setOfframpExecutionInput: (executionInput) => set({ offrampExecutionInput: executionInput }),
    setOfframpSigningPhase: (phase) => set({ offrampSigningPhase: phase }),
    setOfframpKycStarted: (kycStarted) => set({ offrampKycStarted: kycStarted }),
    setOfframpSummaryVisible: (visible) => set({ offrampSummaryVisible: visible }),
    updateOfframpHookStateFromState: (state) => {
      if (!state || state.phase === 'success' || state.failure !== undefined) {
        set({ offrampSigningPhase: undefined });
      }
      set({ offrampState: state });
    },

    setInitializeFailedMessage: (initializeFailedMessage: string) => {
      set({ initializeFailedMessage });
    },

    resetOfframpState: () => {
      clearOfframpingState();
      set({
        offrampStarted: false,
        offrampInitiating: false,
        offrampKycStarted: false,
        offrampState: undefined,
        offrampSigningPhase: undefined,
        offrampExecutionInput: undefined,
      });
    },

    clearInitializeFailedMessage: () => set({ initializeFailedMessage: undefined }),
  },
}));

export const useOfframpSigningPhase = () => useOfframpStore((state) => state.offrampSigningPhase);
export const useOfframpState = () => useOfframpStore((state) => state.offrampState);
export const useOfframpStarted = () => useOfframpStore((state) => state.offrampStarted);
export const useOfframpInitiating = () => useOfframpStore((state) => state.offrampInitiating);
export const useOfframpExecutionInput = () => useOfframpStore((state) => state.offrampExecutionInput);
export const useOfframpKycStarted = () => useOfframpStore((state) => state.offrampKycStarted);
export const useInitializeFailedMessage = () => useOfframpStore((state) => state.initializeFailedMessage);
export const useOfframpSummaryVisible = () => useOfframpStore((state) => state.offrampSummaryVisible);
export const clearInitializeFailedMessage = () => useOfframpStore.getState().actions.clearInitializeFailedMessage();

export const useOfframpActions = () => useOfframpStore((state) => state.actions);
