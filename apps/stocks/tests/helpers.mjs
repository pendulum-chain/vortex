// Shared test helpers (not a test file: the runner only picks *.test.mjs). Node 18 compatible.
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { createJsonStorage } from "@vortexfi/consumer-kit";

export const APP = fileURLToPath(new URL("../", import.meta.url));
export const REPO = fileURLToPath(new URL("../../../", import.meta.url));

// readdirSync's `recursive` option needs Node 20; CI runs Node 18.
export const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});

/** Every file under apps/stocks/src as {path: "src/…", text}. */
export const sourceFiles = () => walk(join(APP, "src")).map((path) => ({ path: relative(APP, path).split("\\").join("/"), text: readFileSync(path, "utf8") }));

/** In-memory Web Storage shim. */
export function memoryStorage() {
  const memory = new Map();
  return {
    memory,
    getItem: (key) => (memory.has(key) ? memory.get(key) : null),
    setItem: (key, value) => { memory.set(key, String(value)); },
    removeItem: (key) => { memory.delete(key); },
  };
}

/** The kit's JSON wrapper over a fresh in-memory storage. */
export function jsonMemory() {
  const backing = memoryStorage();
  return { backing, storage: createJsonStorage(() => backing) };
}

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Swaps globalThis.fetch for the duration of `run`, the way Gold's tests do. */
export async function withFetch(fake, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await run(); } finally { globalThis.fetch = original; }
}

/** A fetch that fails the test if anything calls it. */
export function forbiddenFetch(calls = []) {
  return async (url) => { calls.push(String(url)); throw new Error(`unexpected fetch ${url}`); };
}

/** A settable clock: now() and a sleep() that advances it (no real waiting). */
export function fakeClock(start = Date.parse("2026-09-28T15:00:00Z")) {
  let time = start;
  return {
    now: () => time,
    advance: (ms) => { time += ms; },
    sleep: async (ms, signal) => {
      if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
      time += ms;
    },
  };
}

export const WALLET = "0x71c20000000000000000000000000000000093a4";
export const WALLET_B = "0x0000000000000000000000000000000000000b0b";
