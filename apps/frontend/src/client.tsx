import * as Sentry from "@sentry/react";
import { RouterProvider } from "@tanstack/react-router";
import { hydrateStart } from "@tanstack/react-start/client";
import { startTransition } from "react";
import { hydrateRoot } from "react-dom/client";
import { config } from "./config";
import { SENTRY_DENY_URLS, SENTRY_IGNORE_ERRORS, sentryBeforeSend } from "./helpers/sentry";
import { AuthService } from "./services/auth";
import { initializeEvmTokens } from "./services/tokens";
import "./helpers/googleTranslate";

// Sentry must initialize before the app renders. The TanStack Router tracing integration
// needs the router instance, which Start only hands over once hydration resolves — so the
// router is optional here, for the path where hydration never resolves at all.
function initSentry(router?: Parameters<typeof Sentry.tanstackRouterBrowserTracingIntegration>[0]) {
  const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
  if (!sentryDsn) {
    return;
  }

  Sentry.init({
    beforeSend: sentryBeforeSend,
    denyUrls: SENTRY_DENY_URLS,
    dsn: sentryDsn,
    enabled: !window.location.hostname.includes("localhost"), // Disable sentry entirely when testing locally
    environment: config.env, // production | staging | development — keeps preview/QA noise out of prod
    ignoreErrors: SENTRY_IGNORE_ERRORS,
    // Explicit replay masking — these are the defaults, but pinned for a KYC/KYB app so a future
    // default change can't start leaking user input into replays.
    integrations: [
      ...(router ? [Sentry.tanstackRouterBrowserTracingIntegration(router)] : []),
      Sentry.replayIntegration({ blockAllMedia: true, maskAllText: true })
    ],
    // Capture 100% of sessions where an error occurs; sample plain sessions only in prod.
    replaysOnErrorSampleRate: 1.0,
    replaysSessionSampleRate: config.isProd ? 0.1 : 1.0,
    // Only propagate trace headers to our own (same-origin) API. The API is served same-origin
    // (/api/...), so this works across all Netlify branch URLs and avoids leaking headers to
    // third parties (Squid, RPCs).
    tracePropagationTargets: [window.location.origin],
    tracesSampleRate: config.isProd ? 0.2 : 1.0
  });

  // On a page reload the session is restored from localStorage without calling storeTokens, so
  // seed the Sentry user here too (pseudonymous id only). Runtime login/logout keeps it in sync.
  const restoredUserId = AuthService.getUserId();
  if (restoredUserId) {
    Sentry.setUser({ id: restoredUserId });
  }
}

// Initialize dynamic EVM tokens from SquidRouter API (falls back to static config on failure)
initializeEvmTokens();

hydrateStart()
  .then(router => {
    initSentry(router);

    startTransition(() => {
      hydrateRoot(document, <RouterProvider router={router} />, {
        onCaughtError: Sentry.reactErrorHandler(),
        onRecoverableError: Sentry.reactErrorHandler(),
        onUncaughtError: Sentry.reactErrorHandler()
      });
    });
  })
  .catch(error => {
    // Hydration never produced a router, so the app will never mount. On a prerendered marketing
    // route the visitor is left with static, inert HTML; on `/widget` (ssr: false) the page stays
    // blank. Without this, Sentry is never initialized and the failure dies as an unhandled
    // rejection — the one class of bug we would have no telemetry for.
    initSentry();
    Sentry.captureException(error);
  });
