import { create } from 'zustand';
import { RampZustand, RampActions } from '../types/phases';

interface RampStore extends RampZustand {
  actions: RampActions;
}

export const useRampStore = create<RampStore>()((set) => ({
  rampStarted: false,
  rampRegistered: false,
  rampInitiating: false,
  rampKycStarted: false,
  rampState: undefined,
  rampSigningPhase: undefined,
  rampExecutionInput: undefined,
  rampSummaryVisible: false,
  initializeFailedMessage: undefined,

  actions: {
    setRampStarted: (started) => set({ rampStarted: started }),
    setRampRegistered: (registered) => set({ rampRegistered: registered }),
    setRampInitiating: (initiating) => set({ rampInitiating: initiating }),
    setRampState: (state) => set({ rampState: state }),
    setRampExecutionInput: (executionInput) => set({ rampExecutionInput: executionInput }),
    setRampSigningPhase: (phase) => set({ rampSigningPhase: phase }),
    setRampKycStarted: (kycStarted) => set({ rampKycStarted: kycStarted }),
    setRampSummaryVisible: (visible) => set({ rampSummaryVisible: visible }),
    setInitializeFailedMessage: (message: string | undefined) => {
      const displayMessage =
        message ??
        "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!";
      set({ initializeFailedMessage: displayMessage });
    },

    resetRampState: () => {
      // clearOfframpingState();
      set({
        rampStarted: false,
        rampRegistered: false,
        rampInitiating: false,
        rampKycStarted: false,
        rampState: undefined,
        rampSigningPhase: undefined,
        rampExecutionInput: undefined,
      });
    },

    clearInitializeFailedMessage: () => set({ initializeFailedMessage: undefined }),
  },
}));

export const useRampSigningPhase = () => useRampStore((state) => state.rampSigningPhase);
export const useRampState = () => useRampStore((state) => state.rampState);
export const useRampStarted = () => useRampStore((state) => state.rampStarted);
export const useRampRegistered = () => useRampStore((state) => state.rampRegistered);
export const useRampInitiating = () => useRampStore((state) => state.rampInitiating);
export const useRampExecutionInput = () => useRampStore((state) => state.rampExecutionInput);
export const useRampKycStarted = () => useRampStore((state) => state.rampKycStarted);
export const useInitializeFailedMessage = () => useRampStore((state) => state.initializeFailedMessage);
export const useRampSummaryVisible = () => useRampStore((state) => state.rampSummaryVisible);
export const clearInitializeFailedMessage = () => useRampStore.getState().actions.clearInitializeFailedMessage();

export const useRampActions = () => useRampStore((state) => state.actions);
