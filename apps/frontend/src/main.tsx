import "@fontsource/roboto/300.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "react-toastify/dist/ReactToastify.css";
import "../App.css";

import * as Sentry from "@sentry/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ReactQueryDevtools } from "@tanstack/react-query-devtools";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import i18n from "i18next";
import { createRoot } from "react-dom/client";
import { initReactI18next } from "react-i18next";
import { WagmiProvider } from "wagmi";
import { config } from "./config";
import { PolkadotNodeProvider } from "./contexts/polkadotNode";
import { PolkadotWalletStateProvider } from "./contexts/polkadotWallet";
import { SENTRY_DENY_URLS, SENTRY_IGNORE_ERRORS, sentryBeforeSend } from "./helpers/sentry";
import { initializeEvmTokens } from "./services/tokens";
import { wagmiConfig } from "./wagmiConfig";
import "./helpers/googleTranslate";
import { PersistentRampStateProvider } from "./contexts/rampState";
import { routeTree } from "./routeTree.gen";
import enTranslations from "./translations/en.json";
import { getBrowserLanguage, Language } from "./translations/helpers";
import ptTranslations from "./translations/pt.json";

const queryClient = new QueryClient();

// Initialize i18n with browser language as default
// The actual language will be set by the route's beforeLoad
const lng = getBrowserLanguage();

i18n.use(initReactI18next).init({
  fallbackLng: "en",
  lng,
  resources: {
    [Language.English]: {
      translation: enTranslations
    },
    [Language.Portuguese_Brazil]: {
      translation: ptTranslations
    }
  }
});

const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

// Sentry must initialize before the app renders. The TanStack Router tracing
// integration needs the router instance, so init runs after the router is created.
const sentryDsn = import.meta.env.VITE_SENTRY_DSN;
if (sentryDsn) {
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
      Sentry.tanstackRouterBrowserTracingIntegration(router),
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
}

const root = document.getElementById("app");

if (!root) {
  throw new Error("Root element not found");
}

// Initialize dynamic EVM tokens from SquidRouter API (falls back to static config on failure)
initializeEvmTokens();

createRoot(root, {
  onCaughtError: Sentry.reactErrorHandler(),
  onRecoverableError: Sentry.reactErrorHandler(),
  onUncaughtError: Sentry.reactErrorHandler()
}).render(
  <QueryClientProvider client={queryClient}>
    <ReactQueryDevtools initialIsOpen={false} />
    <WagmiProvider config={wagmiConfig}>
      <PersistentRampStateProvider>
        <PolkadotNodeProvider>
          <PolkadotWalletStateProvider>
            <RouterProvider router={router} />
          </PolkadotWalletStateProvider>
        </PolkadotNodeProvider>
      </PersistentRampStateProvider>
    </WagmiProvider>
  </QueryClientProvider>
);
