import "@testing-library/jest-dom/vitest";
import { transferableAbortController } from "node:util";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

// vitest's jsdom environment swaps in jsdom's AbortController/AbortSignal. jsdom's own DOM
// APIs need those, but since Node 24 Node's fetch (which msw intercepts) rejects any signal
// that is not Node's own. fetch gets a Node signal that follows the jsdom one instead.
// Compared by constructor: both classes share the AbortSignal type, so `instanceof` would
// narrow the jsdom branch to `never`.
const NodeAbortSignal = transferableAbortController().signal.constructor;

function toNodeSignal(signal: AbortSignal | null | undefined): AbortSignal | null | undefined {
  if (!signal || signal.constructor === NodeAbortSignal) return signal;
  const controller = transferableAbortController();
  if (signal.aborted) controller.abort(signal.reason);
  else signal.addEventListener("abort", () => controller.abort(signal.reason), { once: true });
  return controller.signal;
}

// jsdom doesn't implement matchMedia; @walletconnect/modal calls it at import time.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      addEventListener: () => undefined,
      addListener: () => undefined,
      dispatchEvent: () => false,
      matches: false,
      media: query,
      onchange: null,
      removeEventListener: () => undefined,
      removeListener: () => undefined
    }) as MediaQueryList;
}

// jsdom doesn't implement the Web Animations API; motion/react and torph call these.
if (typeof Element !== "undefined") {
  if (!Element.prototype.getAnimations) {
    Element.prototype.getAnimations = () => [];
  }
  if (!Element.prototype.animate) {
    // `finished` intentionally never resolves: an instantly-finished animation makes
    // animation libraries restart in a tight loop.
    Element.prototype.animate = () =>
      ({
        cancel: () => undefined,
        finish: () => undefined,
        finished: new Promise(() => undefined),
        onfinish: null,
        pause: () => undefined,
        play: () => undefined,
        reverse: () => undefined
      }) as unknown as Animation;
  }
}

// jsdom doesn't implement IntersectionObserver; motion/react's whileInView needs it.
if (typeof window !== "undefined" && !window.IntersectionObserver) {
  window.IntersectionObserver = class {
    readonly root = null;
    readonly rootMargin = "";
    readonly thresholds = [];
    disconnect() {
      return undefined;
    }
    observe() {
      return undefined;
    }
    takeRecords() {
      return [];
    }
    unobserve() {
      return undefined;
    }
  } as unknown as typeof IntersectionObserver;
}

// "bypass" keeps pre-existing node-environment tests untouched: any request they make
// behaves exactly as before this setup file existed.
beforeAll(() => {
  server.listen({ onUnhandledRequest: "bypass" });
  // Wraps msw's patched fetch, so the signal is converted before msw builds its Request;
  // server.close() restores the original fetch.
  const interceptedFetch = globalThis.fetch;
  globalThis.fetch = (input, init) => interceptedFetch(input, init && { ...init, signal: toNodeSignal(init.signal) });
});

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
