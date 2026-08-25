// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  addIntegration: vi.fn(),
  captureException: vi.fn(),
  getUserId: vi.fn(),
  hydrateRoot: vi.fn(),
  hydrateStart: vi.fn(),
  initializeEvmTokens: vi.fn(),
  init: vi.fn(),
  replayIntegration: vi.fn(() => ({ name: "Replay" })),
  routerTracingIntegration: vi.fn(() => ({ name: "TanStackRouterTracing" }))
}));

vi.mock("@sentry/react", () => ({
  addIntegration: mocks.addIntegration,
  captureException: mocks.captureException,
  init: mocks.init,
  reactErrorHandler: vi.fn(() => vi.fn()),
  replayIntegration: mocks.replayIntegration,
  setUser: vi.fn(),
  tanstackRouterBrowserTracingIntegration: mocks.routerTracingIntegration
}));
vi.mock("@tanstack/react-router", () => ({ RouterProvider: vi.fn() }));
vi.mock("@tanstack/react-start/client", () => ({ hydrateStart: mocks.hydrateStart }));
vi.mock("react-dom/client", () => ({ hydrateRoot: mocks.hydrateRoot }));
vi.mock("./config", () => ({ config: { env: "test", isProd: false } }));
vi.mock("./helpers/googleTranslate", () => ({}));
vi.mock("./helpers/sentry", () => ({
  SENTRY_DENY_URLS: [],
  SENTRY_IGNORE_ERRORS: [],
  sentryBeforeSend: vi.fn()
}));
vi.mock("./services/auth", () => ({ AuthService: { getUserId: mocks.getUserId } }));
vi.mock("./services/tokens", () => ({ initializeEvmTokens: mocks.initializeEvmTokens }));

describe("client hydration monitoring", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_SENTRY_DSN", "https://public@example.invalid/1");
  });

  afterEach(() => {
    vi.clearAllMocks();
    vi.unstubAllEnvs();
  });

  it("initializes monitoring before router hydration and reports startup failures", async () => {
    const hydrationError = new Error("router hydration failed");
    mocks.hydrateStart.mockRejectedValueOnce(hydrationError);

    await import("./client");
    await vi.waitFor(() => expect(mocks.captureException).toHaveBeenCalledWith(hydrationError));

    expect(mocks.init.mock.invocationCallOrder[0]).toBeLessThan(mocks.hydrateStart.mock.invocationCallOrder[0]);
    expect(mocks.hydrateRoot).not.toHaveBeenCalled();
  });

  it("adds router tracing when hydration produces the router", async () => {
    const router = { id: "router" };
    const tracingIntegration = { name: "TanStackRouterTracing" };
    mocks.hydrateStart.mockResolvedValueOnce(router);
    mocks.routerTracingIntegration.mockReturnValueOnce(tracingIntegration);

    await import("./client");
    await vi.waitFor(() => expect(mocks.hydrateRoot).toHaveBeenCalled());

    expect(mocks.routerTracingIntegration).toHaveBeenCalledWith(router);
    expect(mocks.addIntegration).toHaveBeenCalledWith(tracingIntegration);
  });
});
