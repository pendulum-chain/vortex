// Demo mode sign-in: a fake "Ana Silva" with Gold's demo wallet address. No Privy, no
// network. Kept in this tab's sessionStorage so a reload stays signed in.
import { useCallback, useMemo, useState } from "react";
import { session } from "@vortexfi/consumer-kit";
import { STOCKS_KEYS } from "./lib/stores.js";

export const DEMO_USER = Object.freeze({ privyDid: "did:privy:demo-ana-silva", name: "Ana Silva", firstName: "Ana", email: "ana@example.com" });
export const DEMO_ADDRESS = "0x71c2F3a68790eAd79216dBE733fb83aF089C93a4";

/** @returns {import("@vortexfi/consumer-kit/privy").ConsumerAuth} */
export function useDemoAuth() {
  const [signedIn, setSignedIn] = useState(() => session.get(STOCKS_KEYS.demoAuth, false) === true);
  const login = useCallback(async () => {
    await new Promise((resolve) => setTimeout(resolve, 550));
    session.set(STOCKS_KEYS.demoAuth, true);
    setSignedIn(true);
  }, []);
  const logout = useCallback(async () => {
    session.remove(STOCKS_KEYS.demoAuth);
    setSignedIn(false);
  }, []);
  return useMemo(() => ({
    kind: "demo",
    status: signedIn ? "authenticated" : "anonymous",
    ready: true,
    authenticated: signedIn,
    user: signedIn ? DEMO_USER : null,
    address: signedIn ? DEMO_ADDRESS : null,
    login,
    logout,
    getEthereumProvider: async () => null,
    switchChain: async () => {},
    getIdentityToken: () => null,
  }), [signedIn, login, logout]);
}
