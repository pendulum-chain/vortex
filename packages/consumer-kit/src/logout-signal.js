// A logout in one tab must also end the Vortex session in the other tabs of the origin: the
// session lives in per-tab sessionStorage, so only a localStorage "storage" event reaches them.
import { local, SHARED_KEYS } from "./storage.js";

export function signalLogout(storage = local) {
  storage.set(SHARED_KEYS.logoutSignal, Date.now());
}

/** Calls back when ANOTHER tab signals a logout (browsers fire "storage" only in other tabs). */
export function onLogoutSignal(callback, target = globalThis.window) {
  if (!target?.addEventListener) return () => {};
  const listener = (event) => {
    if (event.key === SHARED_KEYS.logoutSignal && event.newValue != null) callback();
  };
  target.addEventListener("storage", listener);
  return () => target.removeEventListener("storage", listener);
}
