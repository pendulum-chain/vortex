import { useSyncExternalStore } from "react";
import { AuthService, type ManagedProfileSelection } from "@/services/auth";

let currentSnapshot = AuthService.getAcceptedManagedProfileSelectionSnapshot();
const reactListeners = new Set<() => void>();

function applyStoredSelection(): void {
  const nextSnapshot = AuthService.getManagedProfileSelectionSnapshot();
  if (nextSnapshot === currentSnapshot) return;
  if (!AuthService.canChangeEffectiveIdentity()) {
    AuthService.restoreAcceptedManagedProfileSelection();
    return;
  }
  currentSnapshot = nextSnapshot;
  AuthService.acceptManagedProfileSelectionSnapshot(nextSnapshot);
  const ownerProfileId = AuthService.getEffectiveProfileId();
  AuthService.applyEffectiveIdentity(ownerProfileId);
  for (const listener of reactListeners) listener();
}

export const applyStoredManagedProfileForTests = applyStoredSelection;

AuthService.subscribeManagedProfileSelection(applyStoredSelection);

export function useManagedProfileSelection(): ManagedProfileSelection | null {
  const snapshot = useSyncExternalStore(
    listener => {
      reactListeners.add(listener);
      return () => reactListeners.delete(listener);
    },
    () => currentSnapshot,
    () => null
  );
  const selection = AuthService.parseManagedProfileSelectionSnapshot(snapshot);
  return selection?.managerProfileId === AuthService.getEffectiveBearerProfileId() ? selection : null;
}

export function selectManagedProfile(selection: Omit<ManagedProfileSelection, "managerProfileId">): boolean {
  if (!AuthService.canChangeEffectiveIdentity()) return false;
  const managerProfileId = AuthService.getEffectiveBearerProfileId();
  if (!managerProfileId) return false;
  AuthService.storeManagedProfileSelection({ ...selection, managerProfileId });
  return true;
}

export function clearManagedProfile(): boolean {
  return clearManagedProfileSelection();
}

export function clearManagedProfileSelection(expectedSnapshot?: string): boolean {
  if (!AuthService.canChangeEffectiveIdentity()) return false;
  return AuthService.clearManagedProfileSelection(expectedSnapshot);
}
