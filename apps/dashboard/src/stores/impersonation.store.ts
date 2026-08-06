import { create } from "zustand";
import { AdminConsoleService } from "@/services/api/admin-console.service";
import { AuthService, type ImpersonationSession } from "@/services/auth";
import { clearAccountState } from "./auth.store";

interface ImpersonationState {
  session: ImpersonationSession | null;
  enter: (session: ImpersonationSession) => void;
  exit: () => Promise<void>;
  /** Reconcile with storage — picks up a session cleared elsewhere (e.g. api-client on a 401). */
  syncFromStorage: () => void;
}

/** "Log in as" session: entering/exiting always clears query cache and client state so no
 * data from one identity leaks into the other. */
export const useImpersonationStore = create<ImpersonationState>()((set, get) => ({
  enter: session => {
    clearAccountState();
    AuthService.storeImpersonationSession(session);
    set({ session });
  },
  exit: async () => {
    const { session } = get();
    if (session) {
      try {
        await AdminConsoleService.endImpersonation(session.sessionId);
      } catch {
        // Never strand the operator in someone else's session over a failed network call.
      }
    }
    AuthService.clearImpersonationSession();
    clearAccountState();
    set({ session: null });
  },
  session: AuthService.getImpersonationSession(),
  syncFromStorage: () => {
    const stored = AuthService.getImpersonationSession();
    const current = get().session;
    if (!stored && current) {
      clearAccountState();
      set({ session: null });
      return;
    }
    if (stored && stored.token !== current?.token) {
      set({ session: stored });
    }
  }
}));
