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
  storageService.remove(LocalStorageKeys.MONERIUM_STATE);
};

// Load initial state from localStorage
const loadInitialState = (): Partial<RampZustand> => {
  return storageService.getParsed<Partial<RampZustand>>(LocalStorageKeys.RAMPING_STATE, {}) || {};
};

// Create the store with initial state from localStorage
export const useRampStore = create<RampStore>()((set, get) => {
  // Initialize with default values merged with localStorage values
  const initialState = {
    canRegisterRamp: false,
    initializeFailedMessage: undefined,
    rampExecutionInput: undefined,
    rampInitiating: false,
    rampKycLevel2Started: false,
    rampKycStarted: false,
    rampPaymentConfirmed: false,
    rampRegistered: false,
    rampRegistrationError: undefined,
    rampSigningPhase: undefined,
    rampStarted: false,
    rampState: undefined,
    rampSummaryVisible: false,
    signingRejected: false,
    ...loadInitialState()
  };

  // Create a function to save state to localStorage
  const saveState = () => {
    const state = get();
    const stateToSave = {
      canRegisterRamp: state.canRegisterRamp,
      rampExecutionInput: state.rampExecutionInput,
      rampInitiating: state.rampInitiating,
      rampKycLevel2Started: state.rampKycLevel2Started,
      rampKycStarted: state.rampKycStarted,
      rampPaymentConfirmed: state.rampPaymentConfirmed,
      rampRegistered: state.rampRegistered,
      rampRegistrationError: state.rampRegistrationError,
      rampSigningPhase: state.rampSigningPhase,
      rampStarted: state.rampStarted,
      rampState: state.rampState,
      rampSummaryVisible: state.rampSummaryVisible,
      signingRejected: state.signingRejected
    };
    storageService.set(LocalStorageKeys.RAMPING_STATE, stateToSave);
  };

  return {
    ...initialState,

    actions: {
      clearInitializeFailedMessage: () => {
        set({ initializeFailedMessage: undefined });
        saveState();
      },
      resetRampState: () => {
        clearRampingState();

        set({
          canRegisterRamp: false,
          initializeFailedMessage: undefined,
          rampExecutionInput: undefined,
          rampInitiating: false,
          rampKycStarted: false,
          rampPaymentConfirmed: false,
          rampRegistered: false,
          rampRegistrationError: undefined,
          rampSigningPhase: undefined,
          rampStarted: false,
          rampState: undefined,
          rampSummaryVisible: false,
          signingRejected: false // Reset new state
        });
        // No need to save state here as we just cleared it
      },
      setCanRegisterRamp: (canRegister: boolean) => {
        set({ canRegisterRamp: canRegister });
        saveState();
      },
      setInitializeFailedMessage: (message: string | undefined) => {
        const displayMessage =
          message ??
          "We're experiencing a digital traffic jam. Please hold tight while we clear the road and get things moving again!";
        set({ initializeFailedMessage: displayMessage });
        saveState();
      },
      setRampExecutionInput: executionInput => {
        set({ rampExecutionInput: executionInput });
        saveState();
      },
      setRampInitiating: initiating => {
        set({ rampInitiating: initiating });
        saveState();
      },
      setRampKycLevel2Started: kycLevel2Started => {
        set({ rampKycLevel2Started: kycLevel2Started });
        saveState();
      },
      setRampKycStarted: kycStarted => {
        set({ rampKycStarted: kycStarted });
        saveState();
      },
      setRampPaymentConfirmed: paymentConfirmed => {
        set({ rampPaymentConfirmed: paymentConfirmed });
        saveState();
      },
      setRampRegistered: registered => {
        set({ rampRegistered: registered });
        saveState();
      },
      setRampRegistrationError: (error: string | undefined) => {
        set({ rampRegistrationError: error });
        saveState();
      },
      setRampSigningPhase: phase => {
        set({ rampSigningPhase: phase });
        saveState();
      },
      setRampStarted: started => {
        set({ rampStarted: started });
        saveState();
      },
      setRampState: state => {
        set({ rampState: state });
        saveState();
      },
      setRampSummaryVisible: visible => {
        set({ rampSummaryVisible: visible });
        saveState();
      },
      setSigningRejected: rejected => {
        set({ signingRejected: rejected });
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
export const useRampRegistrationError = () => useRampStore(state => state.rampRegistrationError);

export const useRampActions = () => useRampStore(state => state.actions);
