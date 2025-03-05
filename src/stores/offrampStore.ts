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

  initializeFailedMessage: undefined,

  actions: {
    setOfframpStarted: (started) => set({ offrampStarted: started }),
    setOfframpInitiating: (initiating) => set({ offrampInitiating: initiating }),
    setOfframpState: (state) => set({ offrampState: state }),
    setOfframpExecutionInput: (executionInput) => set({ offrampExecutionInput: executionInput }),
    setOfframpSigningPhase: (phase) => set({ offrampSigningPhase: phase }),
    setOfframpKycStarted: (kycStarted) => set({ offrampKycStarted: kycStarted }),

    updateOfframpHookStateFromState: (state) => {
      if (!state || state.phase === 'success' || state.failure !== undefined) {
        set({ offrampSigningPhase: undefined });
      }
      set({ offrampState: state });
    },

    setInitializeFailedMessage: (message: string | undefined) => {
      const displayMessage =
        message ??
        "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!";
      set({ initializeFailedMessage: displayMessage });
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
export const clearInitializeFailedMessage = () => useOfframpStore.getState().actions.clearInitializeFailedMessage();

export const useOfframpActions = () => useOfframpStore((state) => state.actions);
