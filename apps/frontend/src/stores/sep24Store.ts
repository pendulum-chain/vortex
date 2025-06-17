import { create } from "zustand";
import { IAnchorSessionParams, ISep24Intermediate } from "../types/sep";

export interface Sep24State {
  anchorSessionParams: IAnchorSessionParams | undefined;
  initialResponse: ISep24Intermediate | undefined;
  urlInterval: number | undefined;
}

export interface Sep24Actions {
  setAnchorSessionParams: (params: IAnchorSessionParams | undefined) => void;
  setInitialResponse: (response: ISep24Intermediate | undefined) => void;
  setUrlInterval: (interval: number | undefined) => void;
  reset: () => void;
  cleanup: () => void;
}

interface Sep24Store extends Sep24State {
  actions: Sep24Actions;
  cachedAnchorUrl: string | undefined;
}

const useSep24Store = create<Sep24Store>()((set, get) => ({
  anchorSessionParams: undefined,
  initialResponse: undefined,
  executionInput: undefined,
  urlInterval: undefined,
  cachedAnchorUrl: undefined,

  actions: {
    setAnchorSessionParams: params => set({ anchorSessionParams: params }),
    setInitialResponse: response => {
      set({ cachedAnchorUrl: response?.url });
      set({ initialResponse: response });
    },
    setUrlInterval: interval => set({ urlInterval: interval }),

    reset: () =>
      set({
        anchorSessionParams: undefined,
        initialResponse: undefined,
        urlInterval: undefined
      }),

    cleanup: () => {
      const { urlInterval } = get();
      const actions = get().actions;

      if (urlInterval !== undefined) {
        clearInterval(urlInterval);
        actions.setUrlInterval(undefined);
        actions.setInitialResponse(undefined);
        actions.setAnchorSessionParams(undefined);
      }
    }
  }
}));

export const useSep24Actions = () => useSep24Store(state => state.actions);
export const useSep24InitialResponse = () => useSep24Store(state => state.initialResponse);
export const useSep24UrlInterval = () => useSep24Store(state => state.urlInterval);
export const useSep24AnchorSessionParams = () => useSep24Store(state => state.anchorSessionParams);
export const useSep24StoreCachedAnchorUrl = () => useSep24Store(state => state.cachedAnchorUrl);
