import { useSyncExternalStore } from "react";
import { AdminConsoleService } from "@/services/api/admin-console.service";
import { AuthService, type ImpersonationSession } from "@/services/auth";
import { clearAccountState } from "./auth.store";

let currentSnapshot = AuthService.getImpersonationSessionSnapshot();
const reactListeners = new Set<() => void>();

function applyStoredIdentity(): void {
  const nextSnapshot = AuthService.getImpersonationSessionSnapshot();
  if (nextSnapshot === currentSnapshot) return;

  currentSnapshot = nextSnapshot;
  clearAccountState();
  for (const listener of reactListeners) {
    listener();
  }
}

// One bridge owns cross-tab and same-tab storage notifications for the app lifetime. React
// consumers subscribe to the cached snapshot below, so multiple components never duplicate
// account-state cleanup for one identity transition.
AuthService.subscribeImpersonationSession(applyStoredIdentity);

function subscribe(listener: () => void): () => void {
  reactListeners.add(listener);
  return () => reactListeners.delete(listener);
}

function getSnapshot(): string | null {
  return currentSnapshot;
}

/** `localStorage` is the single source of truth, including changes made in another tab. */
export function useImpersonationSession(): ImpersonationSession | null {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, () => null);
  return AuthService.parseImpersonationSessionSnapshot(snapshot);
}

/** Entering a new identity synchronously clears every account-scoped client cache. */
export function enterImpersonation(session: ImpersonationSession): void {
  AuthService.storeImpersonationSession(session);
}

/**
 * Exit locally first. The revocation request already captured the session token when this
 * function clears storage, and is allowed to finish best-effort without blocking the UI.
 */
export function exitImpersonation(): void {
  const session = AuthService.getImpersonationSession();
  if (session) {
    void AdminConsoleService.endImpersonation(session.sessionId).catch(() => {
      // The server session remains bounded by its non-renewable 30-minute TTL.
    });
  }
  AuthService.clearImpersonationSession();
}
