// The Vortex e-mail OTP session, lifted from Gold (apps/gold/src/lib/vortex.js) with every
// Gold fix (pt-BR code e-mail, refresh coalescing, 401-only teardown, reuse per e-mail) and
// bound to the Privy user (DID), so a different Privy user in the same tab never inherits it.
import { SHARED_KEYS } from "../storage.js";
import { VortexError } from "./api.js";

/**
 * Stored shape (JSON, sessionStorage by default):
 * { ...verifyOtpResponse, access_token:string, refresh_token:string, email:string,
 *   privyDid?:string, boundAt?:number }      (privyDid looks like "did:privy:...")
 * @typedef {Record<string, any> & {access_token:string, refresh_token?:string, email?:string, privyDid?:string, boundAt?:number}} VortexSession
 */
export const VORTEX_SESSION_KEY = SHARED_KEYS.vortexSession;

export const normalizeEmail = (email) => String(email || "").trim().toLowerCase();

function normalizeSession(value) {
  if (!value) return null;
  const accessToken = value.access_token || value.accessToken;
  const refreshToken = value.refresh_token || value.refreshToken;
  if (!accessToken) return null;
  return { ...value, access_token: accessToken, refresh_token: refreshToken };
}

function jwtExpiresAt(token) {
  try {
    const encoded = token.split(".")[1];
    const json = atob(encoded.replace(/-/g, "+").replace(/_/g, "/"));
    return Number(JSON.parse(json).exp || 0) * 1000;
  } catch { return 0; }
}

// Per-tab by default: closing the tab ends the Vortex session. A localStorage
// backend is possible by injecting `storage`, but it is off until a CSP and timeouts exist.
const tabStorage = () => (typeof window === "undefined" ? null : window.sessionStorage);

/**
 * @param {{ api: ReturnType<typeof import("./api.js").createApi>,
 *           storage?: () => Storage|null, key?: string, locale?: string,
 *           now?: () => number, refreshSkewMs?: number }} cfg
 */
export function createVortexSession({ api, storage = tabStorage, key = VORTEX_SESSION_KEY, locale = "pt-BR", now = Date.now, refreshSkewMs = 60_000 }) {
  if (typeof api !== "function") throw new Error("createVortexSession needs an api from createApi().");
  let refreshPromise = null;
  let generation = 0;
  let verification = 0;
  let refreshGeneration = -1;
  const replaced = () => new VortexError("Sua sessão mudou. Confirme seu e-mail novamente.", { status: 401, code: "SESSION_REPLACED" });
  const store = () => {
    try { return storage() ?? null; } catch { return null; }
  };

  /** @returns {VortexSession|null} */
  function get() {
    try { return normalizeSession(JSON.parse(store()?.getItem(key) || "null")); } catch { return null; }
  }

  function writeSession(value) {
    const next = normalizeSession(value);
    if (!next) throw new VortexError("A resposta de login da Vortex não contém uma sessão válida.", { code: "INVALID_SESSION" });
    store()?.setItem(key, JSON.stringify(next));
    return next;
  }

  function set(value) { const next = writeSession(value); generation += 1; return next; }

  function clear() {
    generation += 1;
    try { store()?.removeItem(key); } catch { /* storage unavailable: nothing to clear */ }
  }

  async function requestOtp(email) {
    verification += 1;
    // Without a locale the API sends the English e-mail and resets the user's stored locale to en-US.
    return api("/v1/auth/request-otp", { method: "POST", body: JSON.stringify({ email: normalizeEmail(email), locale }) });
  }

  async function verifyOtp(email, code, { privyDid } = {}) {
    const started = generation;
    const attempt = ++verification;
    const verifiedEmail = normalizeEmail(email);
    const response = await api("/v1/auth/verify-otp", { method: "POST", body: JSON.stringify({ email: verifiedEmail, token: String(code).replace(/\D/g, "") }) });
    if (generation !== started || verification !== attempt) throw replaced();
    // Kept with the session, like the widget's stored user e-mail, so it is only reused for that
    // address, and bound to the Privy user who typed the code.
    return set({ ...response, email: verifiedEmail, ...(privyDid ? { privyDid, boundAt: now() } : {}) });
  }

  /**
   * A session verified in this tab skips the code step:
   * 1. no stored session -> false;
   * 2. stored privyDid: the same DID -> true, a different one -> clear() and false;
   * 3. legacy session without privyDid (written by Gold): the same e-mail -> stamp the DID, true.
   * Without a Privy DID nothing is reused.
   */
  function hasSession({ email, privyDid } = {}) {
    const current = get();
    if (!current || !privyDid) return false;
    if (current.privyDid) {
      if (current.privyDid === privyDid) return true;
      clear();
      return false;
    }
    const verifiedEmail = normalizeEmail(email);
    if (!verifiedEmail || current.email !== verifiedEmail) return false;
    try {
      set({ ...current, privyDid, boundAt: now() });
      return true;
    } catch { return false; }
  }

  async function refresh() {
    if (refreshPromise && refreshGeneration === generation) return refreshPromise;
    const started = generation;
    refreshGeneration = started;
    const previous = get();
    if (!previous?.refresh_token) {
      clear();
      throw new VortexError("Sua sessão de segurança expirou. Solicite um novo código.", { status: 401, code: "SESSION_EXPIRED" });
    }
    // Only a 401 means the refresh token is invalid; a network
    // error or a 503 must keep the session so the user is not logged out mid-operation.
    // A logout or user switch may clear (or replace) the session while the refresh is in flight:
    // then neither its result nor its rejection may touch what is stored now.
    const unchanged = () => generation === started && get()?.refresh_token === previous.refresh_token;
    const pending = api("/v1/auth/refresh", { method: "POST", body: JSON.stringify({ refresh_token: previous.refresh_token }) })
      .then((next) => {
        if (!unchanged()) throw new VortexError("Sua sessão de segurança expirou. Solicite um novo código.", { status: 401, code: "SESSION_REPLACED" });
        return writeSession({ ...next, email: previous.email, privyDid: previous.privyDid, boundAt: previous.boundAt });
      }, (error) => { if (error.status === 401 && unchanged()) clear(); throw error; })
      .finally(() => { if (refreshPromise === pending) refreshPromise = null; });
    refreshPromise = pending;
    return refreshPromise;
  }

  async function getFreshAccessToken() {
    const current = get();
    if (!current) return null;
    const expiresAt = jwtExpiresAt(current.access_token);
    if (expiresAt && expiresAt <= now() + refreshSkewMs) return (await refresh()).access_token;
    return current.access_token;
  }

  async function authenticatedApi(path, options = {}) {
    const started = generation;
    const token = await getFreshAccessToken();
    if (generation !== started) throw replaced();
    if (!token) throw new VortexError("Confirme seu e-mail com o código antes de continuar.", { status: 401, code: "AUTH_REQUIRED" });
    try {
      const response = await api(path, options, { token });
      if (generation !== started) throw replaced();
      return response;
    }
    catch (error) {
      if (generation !== started) throw replaced();
      if (error.status !== 401 || !get()?.refresh_token) throw error;
      const refreshed = await refresh();
      if (generation !== started) throw replaced();
      const response = await api(path, options, { token: refreshed.access_token });
      if (generation !== started) throw replaced();
      return response;
    }
  }

  return { get, set, clear, requestOtp, verifyOtp, hasSession, refresh, getFreshAccessToken, authenticatedApi };
}
