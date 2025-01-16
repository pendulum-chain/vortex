import { create } from 'zustand';
import { IAnchorSessionParams, ISep24Intermediate } from '../types/sep';
import { ExecutionInput } from '../hooks/offramp/useMainProcess';

export type ExtendedExecutionInput = ExecutionInput & { stellarEphemeralSecret: string };

export interface Sep24State {
  anchorSessionParams: IAnchorSessionParams | undefined;
  initialResponse: ISep24Intermediate | undefined;
  executionInput: ExtendedExecutionInput | undefined;
  urlInterval: number | undefined;
}

export interface Sep24Actions {
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  setInitialResponse: (response: ISep24Intermediate | undefined) => void;
  setExecutionInput: (input: ExtendedExecutionInput | undefined) => void;
  setUrlInterval: (interval: number | undefined) => void;
  reset: () => void;
  cleanup: () => void;
}

interface Sep24Store extends Sep24State {
  actions: Sep24Actions;
}

const useSep24Store = create<Sep24Store>()((set, get) => ({
  anchorSessionParams: undefined,
  initialResponse: undefined,
  executionInput: undefined,
  urlInterval: undefined,

  actions: {
    setAnchorSessionParams: (params) => set({ anchorSessionParams: params }),
    setInitialResponse: (response) => set({ initialResponse: response }),
    setExecutionInput: (input) => set({ executionInput: input }),
    setUrlInterval: (interval) => set({ urlInterval: interval }),

    reset: () => {
      set({
        anchorSessionParams: undefined,
        initialResponse: undefined,
        executionInput: undefined,
        urlInterval: undefined,
      });
    },

    cleanup: () => {
      const { urlInterval } = get();
      const actions = get().actions;

      if (urlInterval !== undefined) {
        clearInterval(urlInterval);
        actions.setUrlInterval(undefined);
        actions.setInitialResponse(undefined);
        actions.setExecutionInput(undefined);
        actions.setAnchorSessionParams(undefined);
      }
    },
  },
}));

export const useSep24Actions = () => useSep24Store((state) => state.actions);
export const useSep24InitialResponse = () => useSep24Store((state) => state.initialResponse);
export const useSep24UrlInterval = () => useSep24Store((state) => state.urlInterval);
export const useSep24AnchorSessionParams = () => useSep24Store((state) => state.anchorSessionParams);
export const useSep24ExecutionInput = () => useSep24Store((state) => state.executionInput);
