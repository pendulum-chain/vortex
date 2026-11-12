// App-level data hooks. Prices, charts and market status are eager and light; the runtime (ramp
// adapter + portfolio read, viem) is imported lazily the first time it is needed.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createChartLoader } from "./lib/chart.js";
import { PRICE_FRESH_MS, createMarket, pollWhileVisible } from "./lib/market.js";
import { isComingSoon, rampOpenState, uniformAvailability, withIssuerPauses } from "./lib/ramp-contract.js";
import { STOCK_TOKENS } from "./lib/stocks.js";

/** Display prices (one batched call, 60 s poll while visible) and USD/BRL for the secondary line. */
export function useMarket(config) {
  const model = useMemo(() => createMarket({ mode: config.prices }), [config.prices]);
  const chartLoader = useMemo(() => createChartLoader({ mode: config.prices }), [config.prices]);
  const [state, setState] = useState(() => model.peek());
  const [loading, setLoading] = useState(() => model.peek().status === "unavailable");
  const [fx, setFx] = useState(null);
  useEffect(() => {
    let alive = true;
    const run = (force) => model.getPrices({ force }).then((next) => { if (alive) { setState(next); setLoading(false); } });
    run(false);
    if (config.locale !== "en") model.getUsdBrl().then((next) => { if (alive) setFx(next); });
    const stop = pollWhileVisible(() => run(true), { intervalMs: 60_000, isStale: () => Date.now() - Number(model.peek().savedAt || 0) > PRICE_FRESH_MS });
    return () => { alive = false; stop(); };
  }, [model, config.locale]);
  return { model, chartLoader, state, loading, fx };
}

/** Wall clock that re-renders every `intervalMs` ("atualizado há N min", market status, countdowns). */
export function useNow(intervalMs = 30_000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(timer);
  }, [intervalMs]);
  return now;
}

export function useOnline() {
  const [online, setOnline] = useState(() => (typeof navigator === "undefined" ? true : navigator.onLine !== false));
  useEffect(() => {
    const update = () => setOnline(navigator.onLine !== false);
    window.addEventListener("online", update);
    window.addEventListener("offline", update);
    return () => { window.removeEventListener("online", update); window.removeEventListener("offline", update); };
  }, []);
  return online;
}

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)";

export function useReducedMotion() {
  const [reduced, setReduced] = useState(() => typeof window !== "undefined" && Boolean(window.matchMedia?.(REDUCED_MOTION).matches));
  useEffect(() => {
    const query = window.matchMedia?.(REDUCED_MOTION);
    if (!query) return undefined;
    const update = () => setReduced(query.matches);
    query.addEventListener?.("change", update);
    return () => query.removeEventListener?.("change", update);
  }, []);
  return reduced;
}

let runtimePromise = null;

/** Loads src/runtime.js once `needed` turns true; the same instance for the whole page. */
export function useRuntime(needed, config, market) {
  const [runtime, setRuntime] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    if (!needed || runtime) return undefined;
    let alive = true;
    if (!runtimePromise) runtimePromise = import("./runtime.js").then((module) => module.createRuntime({ config, market }));
    runtimePromise.then((next) => { if (alive) { setRuntime(next); setError(null); } }, (nextError) => {
      runtimePromise = null;
      if (alive) setError(nextError);
    });
    return () => { alive = false; };
  }, [needed, runtime, config, market]);
  return { runtime, error };
}

/**
 * Holdings on Robinhood Chain (or the demo holdings): on sign-in, every 30 s while visible, and on
 * demand (after a ramp: refreshSoon). A failed read keeps the last good values ("rpc_error").
 */
export function usePortfolio({ runtime, address, prices }) {
  const [snapshot, setSnapshot] = useState(null);
  const owner = address?.toLowerCase() ?? null;
  const timers = useRef([]);
  // The address the screen shows now: a read (or a refreshSoon timer) started for another address,
  // e.g. before a sign-out and another sign-in, must not overwrite the new user's holdings.
  const current = useRef({ runtime, owner, request: 0 });
  if (current.current.runtime !== runtime || current.current.owner !== owner) current.current = { runtime, owner, request: 0 };
  const refresh = useCallback(async () => {
    const identity = current.current;
    if (!runtime || !owner || identity.runtime !== runtime || identity.owner !== owner) return;
    const request = ++identity.request;
    try {
      const next = await runtime.readHoldings(owner);
      if (current.current !== identity || identity.request !== request) return;
      setSnapshot({ owner, runtime, read: next, status: "ok" });
    } catch {
      if (current.current === identity && identity.request === request) setSnapshot(previous => ({ owner, runtime, read: previous?.owner === owner && previous.runtime === runtime ? previous.read : null, status: "rpc_error" }));
    }
  }, [runtime, owner]);
  useEffect(() => {
    setSnapshot(null);
    if (!runtime || !owner) return undefined;
    refresh();
    const stop = pollWhileVisible(refresh, { intervalMs: 30_000 });
    return () => {
      stop();
      timers.current.forEach(clearTimeout);
      timers.current = [];
    };
  }, [runtime, owner, refresh]);
  useEffect(() => () => timers.current.forEach(clearTimeout), []);
  const refreshSoon = useCallback(() => {
    refresh();
    timers.current.push(setTimeout(refresh, 2_000), setTimeout(refresh, 15_000));
  }, [refresh]);
  const visible = snapshot?.owner === owner && snapshot.runtime === runtime ? snapshot : null;
  const read = visible?.read ?? null;
  const status = visible?.status ?? (owner ? "loading" : "idle");
  const valued = useMemo(() => (read && runtime ? runtime.valuePortfolio({ read, prices }) : null), [read, runtime, prices]);
  const flags = useMemo(() => (read && runtime ? runtime.tokenFlags(read) : {}), [read, runtime]);
  return { status, read, valued, flags, refresh, refreshSoon };
}

/** Public operational status while real payment instructions are open; never calls Vortex in simulation. */
export function useMaintenanceStatus({ readStatus, enabled }) {
  const [snapshot, setSnapshot] = useState(null);
  const identity = useRef({ readStatus, enabled });
  if (identity.current.readStatus !== readStatus || identity.current.enabled !== enabled) identity.current = { readStatus, enabled };
  const retry = useRef(() => {});
  useEffect(() => {
    if (!enabled) return undefined;
    const owner = identity.current;
    let alive = true, sequence = 0, inFlight = null;
    const run = () => {
      if (inFlight) return inFlight;
      const request = ++sequence;
      const pending = Promise.resolve().then(() => readStatus()).then(
        status => { if (alive && identity.current === owner && sequence === request) setSnapshot({ owner, status }); },
        () => { if (alive && identity.current === owner && sequence === request) setSnapshot({ owner, status: null }); },
      ).finally(() => { if (inFlight === pending) inFlight = null; });
      inFlight = pending;
      return pending;
    };
    const invalidate = () => { sequence++; inFlight = null; setSnapshot(null); };
    const resume = () => { invalidate(); return run(); };
    const visible = () => document.visibilityState === undefined || document.visibilityState === "visible";
    const visibility = () => { invalidate(); if (visible()) run(); };
    retry.current = resume;
    resume();
    const timer = setInterval(() => { if (visible()) run(); }, 15_000);
    window.addEventListener("focus", resume);
    document.addEventListener("visibilitychange", visibility);
    return () => { alive = false; retry.current = () => {}; clearInterval(timer); window.removeEventListener("focus", resume); document.removeEventListener("visibilitychange", visibility); };
  }, [readStatus, enabled]);
  return { status: enabled && snapshot?.owner === identity.current ? snapshot.status : null, refresh: () => retry.current() };
}

/**
 * The resume banner reads this device's record, which cannot know that a ramp finished while the app
 * was closed. With a Vortex session already in this tab (this never asks for the code) the status is
 * read once while no flow is open, and the adapter settles a finished ramp. A failed read leaves the
 * banner as it is: tapping it reports the error.
 */
export function usePendingRampRead({ runtime, rampId, walletAddress, who, idle, onSettled }) {
  useEffect(() => {
    if (!idle || !rampId || !runtime?.verification.hasSession(who)) return undefined;
    let alive = true;
    runtime.adapter.getRamp(rampId, { walletAddress }).then((ramp) => {
      if (alive && ["success", "failure"].includes(ramp.classification)) onSettled();
    }, () => {});
    return () => { alive = false; };
  }, [runtime, rampId, walletAddress, idle]);
}

/**
 * Per-token buy/sell availability. Known without the runtime when the answer is fixed (simulated:
 * open; live with the ramp off: "em breve"); otherwise asked from the adapter every 60 s while
 * visible. Issuer pauses from the chain read always win.
 */
export function useAvailability({ config, runtime, flags }) {
  const fixed = useMemo(() => {
    if (config.rampKind === "simulated") return Object.freeze(Object.fromEntries(STOCK_TOKENS.map((token) => [token.symbol, { buy: true, sell: true, reason: null }])));
    if (!config.rampEnabled) return uniformAvailability(STOCK_TOKENS, "not_enabled");
    return null;
  }, [config]);
  const [asked, setAsked] = useState(null);
  useEffect(() => {
    if (fixed || !runtime) return undefined;
    let alive = true;
    const run = () => runtime.adapter.getAvailability().then((map) => { if (alive) setAsked(map); }, () => {});
    run();
    const stop = pollWhileVisible(run, { intervalMs: 60_000 });
    return () => { alive = false; stop(); };
  }, [fixed, runtime]);
  const map = fixed ?? asked;
  const availability = useMemo(() => (map ? withIssuerPauses(map, flags) : null), [map, flags]);
  const comingSoon = Boolean(map) && Object.values(map).every((entry) => isComingSoon(entry.reason));
  return { availability, comingSoon, rampOpen: rampOpenState(config, map) };
}

/** Clipboard with a short "Copiado" confirmation. */
export function useCopy() {
  const [copied, setCopied] = useState("");
  useEffect(() => {
    if (!copied) return undefined;
    const timer = setTimeout(() => setCopied(""), 2_000);
    return () => clearTimeout(timer);
  }, [copied]);
  const copy = useCallback(async (text, id = "default") => {
    try { await navigator.clipboard?.writeText(text); setCopied(id); } catch { /* clipboard blocked: the text stays visible */ }
  }, []);
  return [copied, copy];
}
