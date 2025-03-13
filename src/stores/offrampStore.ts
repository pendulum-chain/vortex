import { create } from 'zustand';
import { OfframpState, OfframpActions } from '../types/offramp';
import { clearOfframpingState, advanceOfframpingState, ExecutionContext } from '../services/offrampingFlow';

type FlowContext = any;
interface OfframpStore extends OfframpState {
  flowContext?: FlowContext;
  actions: OfframpActions & {
    startFlow: () => Promise<void>;
    updateFlowContext: (context: ExecutionContext) => void;
  };
}

export const useOfframpStore = create<OfframpStore>()((set, get) => ({
  offrampStarted: false,
  offrampInitiating: false,
  offrampKycStarted: false,
  offrampState: undefined,
  offrampSigningPhase: undefined,
  offrampExecutionInput: undefined,
  offrampSummaryVisible: false,
  initializeFailedMessage: undefined,
  flowOngoing: false,

  actions: {
    setOfframpStarted: (started) => set({ offrampStarted: started }),
    setOfframpInitiating: (initiating) => set({ offrampInitiating: initiating }),
    setOfframpState: (state) => set({ offrampState: state }),
    setOfframpExecutionInput: (executionInput) => set({ offrampExecutionInput: executionInput }),
    setOfframpSigningPhase: (phase) => set({ offrampSigningPhase: phase }),
    setOfframpKycStarted: (kycStarted) => set({ offrampKycStarted: kycStarted }),
    setOfframpSummaryVisible: (visible) => set({ offrampSummaryVisible: visible }),
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

    updateFlowContext: (context: any) => {
      // On reload, context is restored and updated after the state.
      // Only then we can start the flow again
      set({ flowContext: context });
      if (get().offrampState && !get().flowOngoing) {
        get().actions.startFlow();
      }
    },

    // Iadvances the state until a final state is reached.
    // Initial state is defined after prepare transactions, and this is triggered.
    startFlow: async () => {
      let currentState = get().offrampState;
      console.log('Starting offramp flow with initial state:', currentState);
      if (!currentState) {
        console.error('No initial state present; cannot start flow.');
        return;
      }
      while (true) {
        // Move finality check out of advanceOfframpingState
        if (currentState!.phase === 'success' || currentState!.failure !== undefined) {
          console.log('Offramping process is in a final phase:', currentState!.phase);
          break;
        }
        set({ flowOngoing: true });
        try {
          // We get the current context values updated throught the apply
          const currentContext = get().flowContext;
          // Advance to the next state
          currentState = get().offrampState;
          const nextState = await advanceOfframpingState(currentState, currentContext);
          set({ offrampState: nextState });
        } catch (error: unknown) {
          console.error('Error advancing offramping state:', error);
        }
      }

      set({ flowOngoing: false });
    },
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
