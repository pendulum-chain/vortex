// The ONLY kit file that imports react / @privy-io/react-auth. Apps load it in a lazy chunk.
import { memo, useEffect, useMemo, useRef } from "react";
import { PrivyProvider, useIdentityToken, usePrivy, useWallets } from "@privy-io/react-auth";
import { CONSUMER_LOGIN_METHODS, consumerProfile } from "./config.js";
import { onLogoutSignal, signalLogout } from "../logout-signal.js";

const LOGIN_METHODS = [...CONSUMER_LOGIN_METHODS.primary, ...CONSUMER_LOGIN_METHODS.overflow];

/**
 * @typedef {{ kind:"privy"|"demo", status:"loading"|"anonymous"|"authenticated"|"error", error?:string|null, ready:boolean, authenticated:boolean,
 *   user: null|{ privyDid:string, name:string, firstName:string, email:string },   // name/firstName "" without a Google name
 *   address: `0x${string}`|null,          // embedded Privy wallet ONLY (walletClientType === "privy"); no external-wallet fallback
 *   login:(method?:"google"|"email")=>Promise<void>,
 *   logout:()=>Promise<void>,             // session.clear() + signalLogout() + privy.logout()  (logs out of Gold too)
 *   getEthereumProvider:()=>Promise<import("viem").EIP1193Provider|null>,
 *   switchChain:(chain:import("viem").Chain)=>Promise<void>,
 *   getIdentityToken:()=>string|null      // for the later Privy -> Vortex session exchange
 * }} ConsumerAuth
 */

function AuthBridge({ session, onAuthChange }) {
  const { ready, authenticated, user, login, logout, error } = usePrivy();
  const initError = error ? "AUTH_INITIALIZATION_FAILED" : null;
  const { wallets } = useWallets();
  const { identityToken } = useIdentityToken();
  const embedded = wallets.find((wallet) => wallet.walletClientType === "privy") ?? null;
  const privyDid = authenticated ? user?.id ?? "" : "";
  const { name, firstName, email } = consumerProfile(user);

  // No Vortex session without a Privy user (also covers a logout in Gold before this page loaded).
  useEffect(() => { if (ready && !authenticated) session.clear(); }, [ready, authenticated, session]);

  // Another Privy user in this tab never inherits the previous user's Vortex session.
  const lastDid = useRef("");
  useEffect(() => {
    if (lastDid.current && privyDid && lastDid.current !== privyDid) session.clear();
    if (privyDid) lastDid.current = privyDid;
  }, [privyDid, session]);

  // Privy hands out new function, user and wallet objects on its renders. ConsumerAuth is rebuilt
  // only when what it exposes changes (primitives below); the callbacks read the latest Privy
  // values through this ref. Otherwise every parent render lifts a "new" auth through
  // onAuthChange, the parent re-renders, and React stops with "Maximum update depth exceeded".
  const live = useRef({ authenticated, login, logout, embedded });
  live.current = { authenticated, login, logout, embedded };

  // A logout in another tab ends this tab's Vortex session and Privy state too.
  useEffect(() => onLogoutSignal(() => {
    session.clear();
    if (live.current.authenticated) Promise.resolve(live.current.logout()).catch(() => {});
  }), [session]);

  const address = authenticated ? embedded?.address ?? null : null;
  const signedIn = Boolean(authenticated && user);
  const auth = useMemo(() => ({
    kind: "privy",
    status: initError ? "error" : !ready ? "loading" : authenticated ? "authenticated" : "anonymous",
    error: initError,
    ready,
    authenticated,
    user: signedIn ? { privyDid, name, firstName, email } : null,
    address,
    login: async (method) => { live.current.login(LOGIN_METHODS.includes(method) ? { loginMethods: [method] } : undefined); },
    logout: async () => { session.clear(); signalLogout(); await live.current.logout(); },
    getEthereumProvider: async () => (live.current.embedded ? live.current.embedded.getEthereumProvider() : null),
    switchChain: async (chain) => {
      if (!live.current.embedded) throw new Error("A carteira ainda está sendo preparada.");
      await live.current.embedded.switchChain(chain.id);
    },
    getIdentityToken: () => identityToken ?? null,
  }), [ready, authenticated, signedIn, privyDid, name, firstName, email, address, identityToken, session, initError]);

  useEffect(() => { onAuthChange?.(auth); }, [auth, onAuthChange]);
  return null;
}

/**
 * Renders no children: it lifts ConsumerAuth to the eagerly rendered app through onAuthChange,
 * and Privy's modal is portalled. Pass stable props: `config` (createPrivyConfig in a module scope or
 * useMemo), `session` and `onAuthChange` (e.g. a useState setter).
 * @param {{ appId:string, config:import("@privy-io/react-auth").PrivyClientConfig,
 *           session:ReturnType<typeof import("../vortex/session.js").createVortexSession>,
 *           onAuthChange:(auth:ConsumerAuth)=>void }} props
 */
export const ConsumerPrivyProvider = memo(function ConsumerPrivyProvider({ appId, config, session, onAuthChange }) {
  // memo: the app re-renders on every lifted auth; the Privy tree must not re-render with it.
  return <PrivyProvider appId={appId} config={config}><AuthBridge session={session} onAuthChange={onAuthChange} /></PrivyProvider>;
});
