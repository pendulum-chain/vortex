import { create } from "zustand";
import { LocalStorageKeys } from "../hooks/useLocalStorage";
import { storageService } from "../services/storage/local";
import { RampActions, RampZustand } from "../types/phases";

interface RampStore extends RampZustand {
  actions: RampActions;
}

const clearRampingState = () => {
  storageService.remove(LocalStorageKeys.RAMPING_STATE);
  storageService.remove(LocalStorageKeys.REGISTER_KEY_LOCAL_STORAGE);
  storageService.remove(LocalStorageKeys.START_KEY_LOCAL_STORAGE);
};

// Load initial state from localStorage
const loadInitialState = (): Partial<RampZustand> => {
  return storageService.getParsed<Partial<RampZustand>>(LocalStorageKeys.RAMPING_STATE, {}) || {};
};

// Create the store with initial state from localStorage
export const useRampStore = create<RampStore>()((set, get) => {
  // Initialize with default values merged with localStorage values
  const initialState = {
    rampStarted: false,
    rampRegistered: false,
    rampInitiating: false,
    rampKycStarted: false,
    rampKycLevel2Started: false,
    rampPaymentConfirmed: false,
    rampState: undefined,
    rampSigningPhase: undefined,
    rampExecutionInput: undefined,
    rampSummaryVisible: false,
    initializeFailedMessage: undefined,
    canRegisterRamp: false,
    signingRejected: false,
    ...loadInitialState()
  };

  // Create a function to save state to localStorage
  const saveState = () => {
    const state = get();
    const stateToSave = {
      rampStarted: state.rampStarted,
      rampRegistered: state.rampRegistered,
      rampInitiating: state.rampInitiating,
      rampKycStarted: state.rampKycStarted,
      rampKycLevel2Started: state.rampKycLevel2Started,
      rampPaymentConfirmed: state.rampPaymentConfirmed,
      rampState: state.rampState,
      rampSigningPhase: state.rampSigningPhase,
      rampExecutionInput: state.rampExecutionInput,
      rampSummaryVisible: state.rampSummaryVisible,
      canRegisterRamp: state.canRegisterRamp,
      signingRejected: state.signingRejected
    };
    storageService.set(LocalStorageKeys.RAMPING_STATE, stateToSave);
  };

  return {
    ...initialState,

    actions: {
      setRampStarted: started => {
        set({ rampStarted: started });
        saveState();
      },
      setRampRegistered: registered => {
        set({ rampRegistered: registered });
        saveState();
      },
      setRampInitiating: initiating => {
        set({ rampInitiating: initiating });
        saveState();
      },
      setRampState: state => {
        set({ rampState: state });
        saveState();
      },
      setRampExecutionInput: executionInput => {
        set({ rampExecutionInput: executionInput });
        saveState();
      },
      setRampSigningPhase: phase => {
        set({ rampSigningPhase: phase });
        saveState();
      },
      setRampKycStarted: kycStarted => {
        set({ rampKycStarted: kycStarted });
        saveState();
      },
      setRampKycLevel2Started: kycLevel2Started => {
        set({ rampKycLevel2Started: kycLevel2Started });
        saveState();
      },
      setRampPaymentConfirmed: paymentConfirmed => {
        set({ rampPaymentConfirmed: paymentConfirmed });
        saveState();
      },
      setRampSummaryVisible: visible => {
        set({ rampSummaryVisible: visible });
        saveState();
      },
      setInitializeFailedMessage: (message: string | undefined) => {
        const displayMessage =
          message ??
          "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!";
        set({ initializeFailedMessage: displayMessage });
        saveState();
      },
      setCanRegisterRamp: (canRegister: boolean) => {
        set({ canRegisterRamp: canRegister });
        saveState();
      },
      setSigningRejected: rejected => {
        set({ signingRejected: rejected });
        saveState();
      },
      resetRampState: () => {
        clearRampingState();

        set({
          rampStarted: false,
          rampRegistered: false,
          rampInitiating: false,
          rampKycStarted: false,
          rampPaymentConfirmed: false,
          rampState: undefined,
          rampSigningPhase: undefined,
          rampExecutionInput: undefined,
          rampSummaryVisible: false,
          initializeFailedMessage: undefined,
          canRegisterRamp: false,
          signingRejected: false // Reset new state
        });
        // No need to save state here as we just cleared it
      },
      clearInitializeFailedMessage: () => {
        set({ initializeFailedMessage: undefined });
        saveState();
      }
    }
  };
});

export const useRampSigningPhase = () => useRampStore(state => state.rampSigningPhase);
export const useRampState = () => useRampStore(state => state.rampState);
export const useRampStarted = () => useRampStore(state => state.rampStarted);
export const useRampRegistered = () => useRampStore(state => state.rampRegistered);
export const useRampInitiating = () => useRampStore(state => state.rampInitiating);
export const useRampExecutionInput = () => useRampStore(state => state.rampExecutionInput);
export const useRampKycStarted = () => useRampStore(state => state.rampKycStarted);
export const useRampKycLevel2Started = () => useRampStore(state => state.rampKycLevel2Started);
export const useRampPaymentConfirmed = () => useRampStore(state => state.rampPaymentConfirmed);
export const useInitializeFailedMessage = () => useRampStore(state => state.initializeFailedMessage);
export const useRampSummaryVisible = () => useRampStore(state => state.rampSummaryVisible);
export const useCanRegisterRamp = () => useRampStore(state => state.canRegisterRamp);
export const clearInitializeFailedMessage = () => useRampStore.getState().actions.clearInitializeFailedMessage();
export const useSigningRejected = () => useRampStore(state => state.signingRejected);

export const useRampActions = () => useRampStore(state => state.actions);
