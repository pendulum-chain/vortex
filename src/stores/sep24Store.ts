import { create } from 'zustand';
import { IAnchorSessionParams, ISep24Intermediate } from '../services/anchor';
import { ExecutionInput } from '../hooks/offramp/useMainProcess';

export type ExtendedExecutionInput = ExecutionInput & { stellarEphemeralSecret: string };

export interface Sep24State {
  anchorSessionParams: IAnchorSessionParams | undefined;
  firstSep24Response: ISep24Intermediate | undefined;
  executionInput: ExtendedExecutionInput | undefined;
  firstSep24Interval: number | undefined;
}

export interface Sep24Actions {
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  setFirstSep24Response: (response: ISep24Intermediate | undefined) => void;
  setExecutionInput: (input: ExtendedExecutionInput | undefined) => void;
  setFirstSep24Interval: (interval: number | undefined) => void;
  resetSep24State: () => void;
  cleanupSep24State: () => void;
}

interface Sep24Store extends Sep24State {
  actions: Sep24Actions;
}

export const useSep24Store = create<Sep24Store>()((set, get) => ({
  // Initial state
  anchorSessionParams: undefined,
  firstSep24Response: undefined,
  executionInput: undefined,
  firstSep24Interval: undefined,

  actions: {
    // Setters
    setAnchorSessionParams: (params) => set({ anchorSessionParams: params }),
    setFirstSep24Response: (response) => set({ firstSep24Response: response }),
    setExecutionInput: (input) => set({ executionInput: input }),
    setFirstSep24Interval: (interval) => set({ firstSep24Interval: interval }),

    // Reset all state
    resetSep24State: () =>
      set({
        anchorSessionParams: undefined,
        firstSep24Response: undefined,
        executionInput: undefined,
        firstSep24Interval: undefined,
      }),

    // Cleanup action
    cleanupSep24State: () => {
      const { firstSep24Interval } = get();
      const actions = get().actions;

      if (firstSep24Interval !== undefined) {
        clearInterval(firstSep24Interval);
        actions.setFirstSep24Interval(undefined);
        actions.setFirstSep24Response(undefined);
        actions.setExecutionInput(undefined);
        actions.setAnchorSessionParams(undefined);
      }
    },
  },
}));

// Selector hooks
export const useSep24Actions = () => useSep24Store((state) => state.actions);
export const useFirstSep24Response = () => useSep24Store((state) => state.firstSep24Response);
export const useFirstSep24Interval = () => useSep24Store((state) => state.firstSep24Interval);
export const useAnchorSessionParams = () => useSep24Store((state) => state.anchorSessionParams);
export const useExecutionInput = () => useSep24Store((state) => state.executionInput);
