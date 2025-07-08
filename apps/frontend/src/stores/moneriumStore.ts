import { create } from "zustand";
import { persist } from "zustand/middleware";
import { LocalStorageKeys } from "../hooks/useLocalStorage";
import { storageService } from "../services/storage/local";

interface MoneriumStore {
  // Triggered when user starts Monerium auth flow
  triggered: boolean;

  // Auth flow state
  // 'idle' - not started any operation
  // 'redirecting' - called API to get interactive redirect URL
  // 'siwe' - called API to authenticate with SIWE
  // 'authenticating' - called API to exchange code for auth token
  // 'completed' - successfully authenticated and received auth token
  flowState: "idle" | "redirecting" | "siwe" | "authenticating" | "completed";

  // PKCE code verifier for OAuth flow
  codeVerifier: string | null;

  authToken: string | null;

  // Whether user is new (needs initial signup)
  isNewUser: boolean;

  // Actions
  setTriggered: (value: boolean) => void;
  setFlowState: (state: MoneriumStore["flowState"]) => void;
  setCodeVerifier: (verifier: string) => void;
  setAuthToken: (code: string) => void;
  setIsNewUser: (isNew: boolean) => void;
  reset: () => void;
}

export const useMoneriumStore = create<MoneriumStore>()(
  persist(
    set => ({
      authToken: null,
      codeVerifier: null,
      flowState: "idle",
      isNewUser: false,
      reset: () =>
        set({
          authToken: null,
          codeVerifier: null,
          flowState: "idle",
          isNewUser: false
        }),
      setAuthToken: token => set({ authToken: token }),
      setCodeVerifier: verifier => set({ codeVerifier: verifier }),
      setFlowState: state => set({ flowState: state }),
      setIsNewUser: isNew => set({ isNewUser: isNew }),
      setTriggered: (value: boolean) => set({ triggered: value }),
      triggered: false
    }),
    {
      name: LocalStorageKeys.MONERIUM_STATE,
      storage: {
        getItem: name => {
          const value = storageService.get(name);
          return value ? JSON.parse(value) : null;
        },
        removeItem: name => storageService.remove(name),
        setItem: (name, value) => storageService.set(name, JSON.stringify(value))
      }
    }
  )
);

export const useMoneriumFlowState = () => useMoneriumStore(state => state.flowState);
export const useMoneriumCodeVerifier = () => useMoneriumStore(state => state.codeVerifier);
export const useMoneriumAuthToken = () => useMoneriumStore(state => state.authToken);
export const useMoneriumIsNewUser = () => useMoneriumStore(state => state.isNewUser);
export const useMoneriumActions = () =>
  useMoneriumStore(state => ({
    reset: state.reset,
    setAuthToken: state.setAuthToken,
    setCodeVerifier: state.setCodeVerifier,
    setFlowState: state.setFlowState,
    setIsNewUser: state.setIsNewUser,
    setTriggered: state.setTriggered
  }));
