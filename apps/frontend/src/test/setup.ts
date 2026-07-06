import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { server } from "./msw-server";

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
beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));

afterEach(() => {
  server.resetHandlers();
  cleanup();
});

afterAll(() => server.close());
