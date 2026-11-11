// Shared test helpers (not a test file: the runner only picks *.test.mjs).

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

/** A storage whose every access throws, like Safari private mode or disabled storage. */
export const throwingStorage = {
  getItem() { throw new Error("SecurityError"); },
  setItem() { throw new Error("QuotaExceededError"); },
  removeItem() { throw new Error("SecurityError"); },
};

/** Unsigned JWT with an `exp` claim, obviously fake. */
export const jwt = (exp) => `e30.${Buffer.from(JSON.stringify({ exp })).toString("base64url")}.fake-test-only`;
export const inOneHour = () => Math.floor(Date.now() / 1000) + 3600;

export const json = (body, status = 200) => new Response(JSON.stringify(body), { status });

/** Swaps globalThis.fetch for the duration of `run`, the way Gold's tests do. */
export async function withFetch(fake, run) {
  const original = globalThis.fetch;
  globalThis.fetch = fake;
  try { return await run(); } finally { globalThis.fetch = original; }
}
